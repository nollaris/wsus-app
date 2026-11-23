using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using Microsoft.UpdateServices.Administration;
using NLog;
using WsusRestApi.Configuration;
using WsusRestApi.Models;

namespace WsusRestApi.Services
{
    /// <summary>
    /// Strictly read-only WSUS SDK data collector.
    /// Never invokes any state-mutating WSUS methods (Approve, Decline, StartSynchronization, etc.).
    /// </summary>
    public sealed class WsusSdkDataService : IWsusDataService
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();
        private readonly WsusConnectionFactory _connectionFactory;
        private readonly int _maxSyncHistoryItems;

        public WsusSdkDataService() : this(new WsusConnectionFactory())
        {
        }

        public WsusSdkDataService(WsusConnectionFactory connectionFactory)
        {
            _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
            _maxSyncHistoryItems = ApiConfigProvider.Instance.GetWsusSettings().MaxSyncHistoryItems;
            if (_maxSyncHistoryItems <= 0)
            {
                _maxSyncHistoryItems = 50;
            }
        }

        public WsusServerSnapshot FetchServerSnapshot(WsusServerConfig serverConfig)
        {
            var capturedAt = DateTime.UtcNow;
            IUpdateServer server = _connectionFactory.Connect(serverConfig);

            var version = server.Version?.ToString() ?? "Unknown";
            var computers = ReadComputers(server, serverConfig.Id);
            var updates = ReadUpdates(server, serverConfig.Id);
            var groups = ReadGroups(server, serverConfig.Id, computers);
            var sync = ReadSyncOverview(server, serverConfig);

            var summary = BuildSummary(serverConfig, version, capturedAt, computers, updates, groups, sync);

            var status = new ServerStatusDto
            {
                Id = serverConfig.Id,
                Name = serverConfig.Name,
                HostName = serverConfig.HostName,
                Port = serverConfig.Port,
                UseSsl = serverConfig.UseSsl,
                Enabled = serverConfig.Enabled,
                Description = serverConfig.Description,
                IsOnline = true,
                Version = version,
                LastRefreshedUtc = capturedAt,
                LastError = null
            };

            return new WsusServerSnapshot
            {
                Status = status,
                Summary = summary,
                Computers = computers,
                Updates = updates,
                Groups = groups,
                Sync = sync,
                CapturedAtUtc = capturedAt
            };
        }

        public ComputerDetailDto FetchComputerDetail(WsusServerConfig serverConfig, string computerId)
        {
            IUpdateServer server = _connectionFactory.Connect(serverConfig);
            IComputerTarget target = server.GetComputerTarget(computerId);
            if (target == null)
                return null;

            var computerDto = MapComputer(server, serverConfig.Id, target);
            var detail = new ComputerDetailDto { Computer = computerDto };

            var installInfoCollection = target.GetUpdateInstallationInfoPerUpdate(new UpdateScope());
            foreach (IUpdateInstallationInfo info in installInfoCollection)
            {
                IUpdate update = info.GetUpdate();
                if (update == null)
                    continue;

                var item = new ComputerUpdateStatusDto
                {
                    UpdateId = update.Id.UpdateId.ToString(),
                    RevisionNumber = update.Id.RevisionNumber,
                    Title = update.Title,
                    KbArticle = ExtractPrimaryKb(update),
                    Classification = update.UpdateClassificationTitle ?? "Other",
                    MsrcSeverity = update.MsrcSeverity.ToString(),
                    InstallationState = info.UpdateInstallationState.ToString(),
                    ArrivalDateUtc = ToNullableUtc(update.ArrivalDate)
                };

                switch (info.UpdateInstallationState)
                {
                    case UpdateInstallationState.Failed:
                        detail.FailedUpdates.Add(item);
                        break;
                    case UpdateInstallationState.InstalledPendingReboot:
                        detail.PendingRebootUpdates.Add(item);
                        break;
                    case UpdateInstallationState.Downloaded:
                    case UpdateInstallationState.NotInstalled:
                        detail.NeededUpdates.Add(item);
                        break;
                    case UpdateInstallationState.Installed:
                        detail.InstalledUpdates.Add(item);
                        break;
                }
            }

            return detail;
        }

        public UpdateDetailDto FetchUpdateDetail(WsusServerConfig serverConfig, string updateId, int? revisionNumber = null)
        {
            if (!Guid.TryParse(updateId, out Guid parsedGuid))
                return null;

            IUpdateServer server = _connectionFactory.Connect(serverConfig);
            UpdateRevisionId revId = revisionNumber.HasValue
                ? new UpdateRevisionId(parsedGuid, revisionNumber.Value)
                : new UpdateRevisionId(parsedGuid);

            IUpdate update = server.GetUpdate(revId);
            if (update == null)
                return null;

            var updateDto = MapUpdate(server, serverConfig.Id, update);
            var detail = new UpdateDetailDto
            {
                Update = updateDto,
                Description = update.Description
            };

            if (update.AdditionalInformationUrls != null)
            {
                foreach (string url in update.AdditionalInformationUrls)
                {
                    detail.AdditionalInfoUrls.Add(url);
                }
            }

            try
            {
                var superseding = update.GetRelatedUpdates(UpdateRelationship.UpdatesThatSupersedeThisUpdate);
                if (superseding != null)
                {
                    foreach (IUpdate sup in superseding)
                    {
                        detail.SupersededByUpdateIds.Add(sup.Id.UpdateId.ToString());
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Could not read superseding updates for {0}", updateId);
            }

            var groupNames = BuildGroupNameLookup(server);
            foreach (IUpdateApproval approval in update.GetUpdateApprovals())
            {
                string groupIdStr = approval.ComputerTargetGroupId.ToString();
                groupNames.TryGetValue(groupIdStr, out string groupName);

                detail.Approvals.Add(new UpdateApprovalDto
                {
                    ApprovalId = approval.Id.ToString(),
                    Action = approval.Action.ToString(),
                    TargetGroupId = groupIdStr,
                    TargetGroupName = groupName ?? groupIdStr,
                    AdministratorName = approval.AdministratorName,
                    CreationDateUtc = ToNullableUtc(approval.CreationDate),
                    GoLiveTimeUtc = ToNullableUtc(approval.GoLiveTime),
                    DeadlineUtc = ToNullableUtc(approval.Deadline)
                });
            }

            var computerLookup = new Dictionary<string, IComputerTarget>(StringComparer.OrdinalIgnoreCase);
            foreach (IComputerTarget ct in server.GetComputerTargets())
            {
                computerLookup[ct.Id] = ct;
            }

            foreach (IUpdateInstallationInfo info in update.GetUpdateInstallationInfoPerComputerTarget(new ComputerTargetScope()))
            {
                computerLookup.TryGetValue(info.ComputerTargetId, out IComputerTarget target);
                detail.ComputerStatuses.Add(new UpdateComputerStatusDto
                {
                    ComputerId = info.ComputerTargetId,
                    FullDomainName = target?.FullDomainName ?? info.ComputerTargetId,
                    IpAddress = target?.IPAddress?.ToString() ?? string.Empty,
                    InstallationState = info.UpdateInstallationState.ToString(),
                    LastSyncTimeUtc = target != null ? ToNullableUtc(target.LastSyncTime) : null
                });
            }

            return detail;
        }

        public GroupDetailDto FetchGroupDetail(WsusServerConfig serverConfig, string groupId)
        {
            if (!Guid.TryParse(groupId, out Guid parsedGroupId))
                return null;

            IUpdateServer server = _connectionFactory.Connect(serverConfig);
            IComputerTargetGroup group = server.GetComputerTargetGroup(parsedGroupId);
            if (group == null)
                return null;

            var computers = new List<ComputerDto>();
            foreach (IComputerTarget target in group.GetComputerTargets())
            {
                computers.Add(MapComputer(server, serverConfig.Id, target));
            }

            var groupDto = BuildGroupDto(serverConfig.Id, group.Id.ToString(), group.Name, computers);
            return new GroupDetailDto
            {
                Group = groupDto,
                Computers = computers
            };
        }

        private List<ComputerDto> ReadComputers(IUpdateServer server, string serverId)
        {
            var result = new List<ComputerDto>();
            foreach (IComputerTarget target in server.GetComputerTargets())
            {
                result.Add(MapComputer(server, serverId, target));
            }
            return result;
        }

        private ComputerDto MapComputer(IUpdateServer server, string serverId, IComputerTarget target)
        {
            var summary = target.GetUpdateInstallationSummary();
            int installed = summary?.InstalledCount ?? 0;
            int needed = (summary?.NotInstalledCount ?? 0) + (summary?.DownloadedCount ?? 0);
            int failed = summary?.FailedCount ?? 0;
            int pendingReboot = summary?.InstalledPendingRebootCount ?? 0;
            int notApplicable = summary?.NotApplicableCount ?? 0;
            int unknown = summary?.UnknownCount ?? 0;

            var lastSyncUtc = ToNullableUtc(target.LastSyncTime);
            var assignedGroups = new List<string>();
            try
            {
                foreach (IComputerTargetGroup grp in target.GetComputerTargetGroups())
                {
                    assignedGroups.Add(grp.Name);
                }
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Could not read target groups for computer {0}", target.Id);
            }

            string complianceStatus;
            if (failed > 0)
                complianceStatus = "Error";
            else if (needed > 0 || pendingReboot > 0)
                complianceStatus = "Needed";
            else if (!lastSyncUtc.HasValue || lastSyncUtc.Value < DateTime.UtcNow.AddDays(-30))
                complianceStatus = "Stale";
            else
                complianceStatus = "Compliant";

            return new ComputerDto
            {
                ComputerId = target.Id,
                ServerId = serverId,
                FullDomainName = target.FullDomainName,
                IpAddress = target.IPAddress?.ToString() ?? string.Empty,
                OsDescription = target.OSDescription ?? "Unknown",
                OsVersion = target.OSInfo?.Version?.ToString(),
                ClientVersion = target.ClientVersion?.ToString() ?? string.Empty,
                ComputerRole = target.ComputerRole.ToString(),
                RequestedTargetGroup = target.RequestedTargetGroupName,
                AssignedTargetGroups = assignedGroups,
                LastSyncTimeUtc = lastSyncUtc,
                LastReportedStatusTimeUtc = ToNullableUtc(target.LastReportedStatusTime),
                LastReportedRebootTimeUtc = ToNullableUtc(target.LastReportedRebootTime),
                InstalledCount = installed,
                NeededCount = needed,
                FailedCount = failed,
                PendingRebootCount = pendingReboot,
                NotApplicableCount = notApplicable,
                UnknownCount = unknown,
                ComplianceStatus = complianceStatus
            };
        }

        private List<UpdateDto> ReadUpdates(IUpdateServer server, string serverId)
        {
            var result = new List<UpdateDto>();
            var scope = new UpdateScope
            {
                ApprovedStates = ApprovedStates.Any,
                IncludedInstallationStates = UpdateInstallationStates.All
            };

            foreach (IUpdate update in server.GetUpdates(scope))
            {
                result.Add(MapUpdate(server, serverId, update));
            }

            return result;
        }

        private UpdateDto MapUpdate(IUpdateServer server, string serverId, IUpdate update)
        {
            IUpdateSummary summary = null;
            try
            {
                summary = update.GetSummary(new ComputerTargetScope());
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Could not read summary for update {0}", update.Id.UpdateId);
            }

            var products = new List<string>();
            try
            {
                foreach (IUpdateCategory cat in update.GetUpdateCategories())
                {
                    if (cat.Type == UpdateCategoryType.Product || cat.Type == UpdateCategoryType.ProductFamily)
                        products.Add(cat.Title);
                }
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Could not read product categories for update {0}", update.Id.UpdateId);
            }

            bool requiresReboot = false;
            try
            {
                requiresReboot = update.InstallationBehavior != null &&
                                 update.InstallationBehavior.RebootBehavior != RebootBehavior.NeverReboots;
            }
            catch
            {
                // Ignore if InstallationBehavior is unavailable for metadata-only updates
            }

            return new UpdateDto
            {
                UpdateId = update.Id.UpdateId.ToString(),
                RevisionNumber = update.Id.RevisionNumber,
                ServerId = serverId,
                Title = update.Title,
                KbArticle = ExtractPrimaryKb(update),
                Classification = update.UpdateClassificationTitle ?? "Other",
                Products = products.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                MsrcSeverity = update.MsrcSeverity.ToString(),
                ArrivalDateUtc = ToNullableUtc(update.ArrivalDate),
                CreationDateUtc = ToNullableUtc(update.CreationDate),
                IsApproved = update.IsApproved,
                IsDeclined = update.IsDeclined,
                IsSuperseded = update.IsSuperseded,
                IsLatestRevision = update.IsLatestRevision,
                UpdateType = update.UpdateType.ToString(),
                RequiresReboot = requiresReboot,
                InstalledCount = summary?.InstalledCount ?? 0,
                NeededCount = (summary?.NotInstalledCount ?? 0) + (summary?.DownloadedCount ?? 0),
                FailedCount = summary?.FailedCount ?? 0,
                PendingRebootCount = summary?.InstalledPendingRebootCount ?? 0,
                NotApplicableCount = summary?.NotApplicableCount ?? 0,
                UnknownCount = summary?.UnknownCount ?? 0
            };
        }

        private List<GroupDto> ReadGroups(IUpdateServer server, string serverId, List<ComputerDto> allComputers)
        {
            var result = new List<GroupDto>();
            var byGroupName = new Dictionary<string, List<ComputerDto>>(StringComparer.OrdinalIgnoreCase);

            foreach (var c in allComputers)
            {
                foreach (var gName in c.AssignedTargetGroups)
                {
                    if (!byGroupName.TryGetValue(gName, out var list))
                    {
                        list = new List<ComputerDto>();
                        byGroupName[gName] = list;
                    }
                    list.Add(c);
                }
            }

            foreach (IComputerTargetGroup group in server.GetComputerTargetGroups())
            {
                byGroupName.TryGetValue(group.Name, out var members);
                result.Add(BuildGroupDto(serverId, group.Id.ToString(), group.Name, members ?? new List<ComputerDto>()));
            }

            return result;
        }

        private static GroupDto BuildGroupDto(string serverId, string groupId, string name, List<ComputerDto> members)
        {
            int total = members.Count;
            int compliant = members.Count(m => m.ComplianceStatus == "Compliant");
            int needing = members.Count(m => m.ComplianceStatus == "Needed");
            int errors = members.Count(m => m.ComplianceStatus == "Error");
            double pct = total > 0 ? Math.Round((double)compliant / total * 100.0, 2) : 100.0;

            return new GroupDto
            {
                GroupId = groupId,
                ServerId = serverId,
                Name = name,
                TotalComputers = total,
                CompliantComputers = compliant,
                ComputersNeedingUpdates = needing,
                ComputersWithErrors = errors,
                CompliancePercent = pct
            };
        }

        private SyncOverviewDto ReadSyncOverview(IUpdateServer server, WsusServerConfig config)
        {
            ISubscription sub = server.GetSubscription();
            IUpdateServerConfiguration serverCfg = server.GetConfiguration();

            var settings = new SyncSettingsDto
            {
                SynchronizeAutomatically = sub.SynchronizeAutomatically,
                SynchronizationTimeOfDayUtc = sub.SynchronizeAutomaticallyTimeOfDay.ToString(@"hh\:mm\:ss"),
                NumberOfSynchronizationsPerDay = sub.NumberOfSynchronizationsPerDay,
                SyncFromMicrosoftUpdate = serverCfg.SyncFromMicrosoftUpdate,
                UpstreamWsusServerName = serverCfg.UpstreamWsusServerName,
                UpstreamWsusServerPortNumber = serverCfg.UpstreamWsusServerPortNumber,
                UpstreamWsusServerUseSsl = serverCfg.UpstreamWsusServerUseSsl,
                IsReplicaServer = serverCfg.IsReplicaServer
            };

            ISynchronizationProgress progress = sub.GetSynchronizationProgress();
            var currentStatus = new SyncStatusDto
            {
                Status = sub.GetSynchronizationStatus().ToString(),
                TotalItems = progress?.TotalItems ?? 0,
                ProcessedItems = progress?.ProcessedItems ?? 0,
                CurrentPhase = progress?.Phase.ToString() ?? "Unknown"
            };

            var history = new List<SyncHistoryItemDto>();
            foreach (ISynchronizationInfo info in sub.GetSynchronizationHistory())
            {
                var startUtc = ToNullableUtc(info.StartTime);
                var endUtc = ToNullableUtc(info.EndTime);
                double? durationSeconds = (startUtc.HasValue && endUtc.HasValue && endUtc.Value >= startUtc.Value)
                    ? Math.Round((endUtc.Value - startUtc.Value).TotalSeconds, 2)
                    : (double?)null;

                history.Add(new SyncHistoryItemDto
                {
                    SynchronizationId = info.Id.ToString(),
                    StartTimeUtc = startUtc,
                    EndTimeUtc = endUtc,
                    DurationSeconds = durationSeconds,
                    Result = info.Result.ToString(),
                    StartedManually = info.StartedManually,
                    Error = info.Error.ToString(),
                    ErrorText = info.ErrorText,
                    UpdateErrorsCount = info.UpdateErrors?.Count ?? 0
                });

                if (history.Count >= _maxSyncHistoryItems)
                    break;
            }

            return new SyncOverviewDto
            {
                ServerId = config.Id,
                ServerName = config.Name,
                Settings = settings,
                CurrentStatus = currentStatus,
                History = history
            };
        }

        private static ServerSummaryDto BuildSummary(
            WsusServerConfig config,
            string version,
            DateTime capturedAtUtc,
            List<ComputerDto> computers,
            List<UpdateDto> updates,
            List<GroupDto> groups,
            SyncOverviewDto sync)
        {
            int totalComputers = computers.Count;
            int compliantComputers = computers.Count(c => c.ComplianceStatus == "Compliant");
            int needingComputers = computers.Count(c => c.ComplianceStatus == "Needed");
            int errorComputers = computers.Count(c => c.ComplianceStatus == "Error");
            int staleComputers = computers.Count(c => !c.LastSyncTimeUtc.HasValue || c.LastSyncTimeUtc.Value < DateTime.UtcNow.AddDays(-30));
            double compliancePct = totalComputers > 0 ? Math.Round((double)compliantComputers / totalComputers * 100.0, 2) : 100.0;

            var lastSync = sync.History.FirstOrDefault();

            return new ServerSummaryDto
            {
                ServerId = config.Id,
                ServerName = config.Name,
                HostName = config.HostName,
                IsOnline = true,
                WsusVersion = version,
                LastRefreshedUtc = capturedAtUtc,
                TotalComputers = totalComputers,
                CompliantComputers = compliantComputers,
                ComputersNeedingUpdates = needingComputers,
                ComputersWithErrors = errorComputers,
                StaleComputers30Days = staleComputers,
                CompliancePercent = compliancePct,
                TotalUpdates = updates.Count,
                ApprovedUpdates = updates.Count(u => u.IsApproved),
                UnapprovedUpdates = updates.Count(u => !u.IsApproved && !u.IsDeclined),
                DeclinedUpdates = updates.Count(u => u.IsDeclined),
                SecurityUpdatesCount = updates.Count(u => string.Equals(u.Classification, "Security Updates", StringComparison.OrdinalIgnoreCase)),
                CriticalUpdatesCount = updates.Count(u => string.Equals(u.Classification, "Critical Updates", StringComparison.OrdinalIgnoreCase)),
                UpdatesNeedingApproval = updates.Count(u => !u.IsApproved && !u.IsDeclined && u.NeededCount > 0),
                TotalGroups = groups.Count,
                LastSyncStartTimeUtc = lastSync?.StartTimeUtc,
                LastSyncEndTimeUtc = lastSync?.EndTimeUtc,
                LastSyncResult = lastSync?.Result ?? "Unknown",
                UpdatesByClassification = updates
                    .GroupBy(u => u.Classification ?? "Other")
                    .ToDictionary(g => g.Key, g => g.Count()),
                ComputersByOs = computers
                    .GroupBy(c => c.OsDescription ?? "Unknown")
                    .ToDictionary(g => g.Key, g => g.Count())
            };
        }

        private static Dictionary<string, string> BuildGroupNameLookup(IUpdateServer server)
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (IComputerTargetGroup grp in server.GetComputerTargetGroups())
            {
                dict[grp.Id.ToString()] = grp.Name;
            }
            return dict;
        }

        private static string ExtractPrimaryKb(IUpdate update)
        {
            if (update.KnowledgebaseArticles == null || update.KnowledgebaseArticles.Count == 0)
                return null;

            string kb = update.KnowledgebaseArticles[0];
            if (string.IsNullOrWhiteSpace(kb))
                return null;

            return kb.StartsWith("KB", StringComparison.OrdinalIgnoreCase) ? kb : "KB" + kb;
        }

        private static DateTime? ToNullableUtc(DateTime dt)
        {
            if (dt == DateTime.MinValue || dt == DateTime.MaxValue)
                return null;

            return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
        }
    }
}
