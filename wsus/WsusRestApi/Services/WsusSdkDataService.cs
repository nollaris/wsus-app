using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.UpdateServices.Administration;
using WsusRestApi.Configuration;
using WsusRestApi.Models;

namespace WsusRestApi.Services
{
    /// <summary>
    /// Local WSUS SDK data and selected control operations (no remoting, C# 5 compatible).
    /// </summary>
    public sealed class WsusSdkDataService : IWsusDataService
    {
        private readonly WsusConnectionFactory _connectionFactory;

        public WsusSdkDataService() : this(new WsusConnectionFactory())
        {
        }

        public WsusSdkDataService(WsusConnectionFactory connectionFactory)
        {
            if (connectionFactory == null) throw new ArgumentNullException("connectionFactory");
            _connectionFactory = connectionFactory;
        }

        public WsusLocalSnapshot FetchLocalSnapshot()
        {
            WsusSettingsConfig settings = ApiConfigProvider.Instance.GetWsusSettings();
            string serverId = settings.ResolvedServerId;
            string serverName = settings.ResolvedServerName;
            int maxSyncHistory = settings.MaxSyncHistoryItems > 0 ? settings.MaxSyncHistoryItems : 50;

            DateTime capturedAt = DateTime.UtcNow;
            try
            {
                IUpdateServer server = _connectionFactory.ConnectLocal();

                string version = server.Version != null ? server.Version.ToString() : "Unknown";
                List<ComputerDto> computers = ReadComputers(server, serverId);
                List<UpdateDto> updates = ReadUpdates(server, serverId);
                List<GroupDto> groups = ReadGroups(server, serverId, computers);
                SyncOverviewDto sync = ReadSyncOverview(server, serverId, serverName, maxSyncHistory);
                ServerSummaryDto summary = BuildSummary(serverId, serverName, version, capturedAt, computers, updates, groups, sync);

                return new WsusLocalSnapshot
                {
                    Summary = summary,
                    Computers = computers,
                    Updates = updates,
                    Groups = groups,
                    Sync = sync,
                    CapturedAtUtc = capturedAt
                };
            }
            catch
            {
                _connectionFactory.ResetConnection();
                throw;
            }
        }

        public ComputerDetailDto FetchComputerDetail(string computerId)
        {
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            IUpdateServer server = _connectionFactory.ConnectLocal();
            IComputerTarget target = server.GetComputerTarget(computerId);
            if (target == null)
                return null;

            ComputerDto computerDto = MapComputer(serverId, target);
            ComputerDetailDto detail = new ComputerDetailDto { Computer = computerDto };

            UpdateInstallationInfoCollection installInfoCollection = target.GetUpdateInstallationInfoPerUpdate(new UpdateScope());

            // Pre-filter installation states before calling info.GetUpdate() (avoids costly SDK calls for NotApplicable/Unknown)
            // and only query 60-day update event history if the computer actually has Failed updates.
            List<IUpdateInstallationInfo> relevantInfos = new List<IUpdateInstallationInfo>();
            bool hasFailed = false;
            foreach (IUpdateInstallationInfo info in installInfoCollection)
            {
                switch (info.UpdateInstallationState)
                {
                    case UpdateInstallationState.Failed:
                        hasFailed = true;
                        relevantInfos.Add(info);
                        break;
                    case UpdateInstallationState.InstalledPendingReboot:
                    case UpdateInstallationState.Downloaded:
                    case UpdateInstallationState.NotInstalled:
                    case UpdateInstallationState.Installed:
                        relevantInfos.Add(info);
                        break;
                }
            }

            Dictionary<string, IUpdateEvent> latestErrorsByUpdate = new Dictionary<string, IUpdateEvent>(StringComparer.OrdinalIgnoreCase);
            if (hasFailed)
            {
                try
                {
                    UpdateEventCollection events = server.GetUpdateEventHistory(DateTime.UtcNow.AddDays(-60), DateTime.UtcNow);
                    if (events != null)
                    {
                        foreach (IUpdateEvent evt in events)
                        {
                            if (!string.Equals(evt.ComputerId, computerId, StringComparison.OrdinalIgnoreCase)) continue;
                            if (evt.UpdateId == null) continue;
                            int errCode = (int)evt.ErrorCode;
                            if (!evt.IsError && errCode == 0) continue;

                            string updKey = evt.UpdateId.UpdateId.ToString();
                            IUpdateEvent existingEvt;
                            if (!latestErrorsByUpdate.TryGetValue(updKey, out existingEvt) ||
                                evt.CreationDate > existingEvt.CreationDate)
                            {
                                latestErrorsByUpdate[updKey] = evt;
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore if event history is unavailable on this WSUS target
                }
            }

            foreach (IUpdateInstallationInfo info in relevantInfos)
            {
                IUpdate update = info.GetUpdate();
                if (update == null)
                    continue;

                string updIdStr = update.Id.UpdateId.ToString();
                IUpdateEvent errEvt = null;
                if (info.UpdateInstallationState == UpdateInstallationState.Failed)
                {
                    latestErrorsByUpdate.TryGetValue(updIdStr, out errEvt);
                }

                int errHResult = errEvt != null ? (int)errEvt.ErrorCode : 0;
                ComputerUpdateStatusDto item = new ComputerUpdateStatusDto
                {
                    UpdateId = updIdStr,
                    RevisionNumber = update.Id.RevisionNumber,
                    Title = update.Title,
                    KbArticle = ExtractPrimaryKb(update),
                    Classification = update.UpdateClassificationTitle ?? "Other",
                    MsrcSeverity = update.MsrcSeverity.ToString(),
                    InstallationState = info.UpdateInstallationState.ToString(),
                    ArrivalDateUtc = ToNullableUtc(update.ArrivalDate),
                    ErrorCode = errHResult != 0
                        ? ("0x" + errHResult.ToString("X8"))
                        : null,
                    ErrorMessage = errEvt != null ? errEvt.Message : null,
                    LastErrorTimeUtc = errEvt != null ? ToNullableUtc(errEvt.CreationDate) : null
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

        private sealed class CachedUpdateMetadata
        {
            public string UpdateId;
            public int RevisionNumber;
            public string Title;
            public string KbArticle;
            public string Classification;
        }

        public List<ClientPatchRecordDto> FetchAllClientPatches(bool includeInstalled)
        {
            try
            {
                IUpdateServer server = _connectionFactory.ConnectLocal();

                // 1. Fetch 60-day error event history once and index by "{computerId}|{updateId}"
                Dictionary<string, IUpdateEvent> latestErrors = new Dictionary<string, IUpdateEvent>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    UpdateEventCollection events = server.GetUpdateEventHistory(DateTime.UtcNow.AddDays(-60), DateTime.UtcNow);
                    if (events != null)
                    {
                        foreach (IUpdateEvent evt in events)
                        {
                            if (string.IsNullOrEmpty(evt.ComputerId) || evt.UpdateId == null) continue;
                            int errCode = (int)evt.ErrorCode;
                            if (!evt.IsError && errCode == 0) continue;

                            string errKey = evt.ComputerId + "|" + evt.UpdateId.UpdateId.ToString();
                            IUpdateEvent existingEvt;
                            if (!latestErrors.TryGetValue(errKey, out existingEvt) ||
                                evt.CreationDate > existingEvt.CreationDate)
                            {
                                latestErrors[errKey] = evt;
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore if event history is unavailable on this WSUS target
                }

                // 2. Cache update metadata by "{updateId}:{revision}" so info.GetUpdate() is called once per unique update
                Dictionary<string, CachedUpdateMetadata> updateMetaCache = new Dictionary<string, CachedUpdateMetadata>(StringComparer.OrdinalIgnoreCase);
                List<ClientPatchRecordDto> records = new List<ClientPatchRecordDto>();

                UpdateScope scope = new UpdateScope();
                scope.IncludedInstallationStates = UpdateInstallationStates.Failed
                    | UpdateInstallationStates.InstalledPendingReboot
                    | UpdateInstallationStates.Downloaded
                    | UpdateInstallationStates.NotInstalled
                    | UpdateInstallationStates.Unknown
                    | UpdateInstallationStates.NotApplicable;
                if (includeInstalled)
                {
                    scope.IncludedInstallationStates |= UpdateInstallationStates.Installed;
                }

                foreach (IComputerTarget target in server.GetComputerTargets())
                {
                    string compId = target.Id;
                    string compName = target.FullDomainName;
                    string compIp = target.IPAddress != null ? target.IPAddress.ToString() : string.Empty;

                    UpdateInstallationInfoCollection installInfos = target.GetUpdateInstallationInfoPerUpdate(scope);
                    foreach (IUpdateInstallationInfo info in installInfos)
                    {
                        UpdateInstallationState state = info.UpdateInstallationState;
                        if (state == UpdateInstallationState.Installed && !includeInstalled)
                        {
                            continue;
                        }

                        string updKey = info.UpdateId.ToString();
                        CachedUpdateMetadata meta;
                        if (!updateMetaCache.TryGetValue(updKey, out meta))
                        {
                            IUpdate update = info.GetUpdate();
                            if (update == null) continue;
                            meta = new CachedUpdateMetadata
                            {
                                UpdateId = update.Id.UpdateId.ToString(),
                                RevisionNumber = update.Id.RevisionNumber,
                                Title = update.Title,
                                KbArticle = ExtractPrimaryKb(update),
                                Classification = update.UpdateClassificationTitle ?? "Other"
                            };
                            updateMetaCache[updKey] = meta;
                        }

                        IUpdateEvent errEvt = null;
                        if (state == UpdateInstallationState.Failed)
                        {
                            latestErrors.TryGetValue(compId + "|" + meta.UpdateId, out errEvt);
                        }

                        int errHResult = errEvt != null ? (int)errEvt.ErrorCode : 0;
                        records.Add(new ClientPatchRecordDto
                        {
                            ComputerId = compId,
                            FullDomainName = compName,
                            IpAddress = compIp,
                            UpdateId = meta.UpdateId,
                            RevisionNumber = meta.RevisionNumber,
                            Title = meta.Title,
                            KbArticle = meta.KbArticle,
                            Classification = meta.Classification,
                            InstallationState = state.ToString(),
                            ErrorCode = errHResult != 0 ? ("0x" + errHResult.ToString("X8")) : null,
                            ErrorMessage = errEvt != null ? errEvt.Message : null
                        });
                    }
                }

                return records;
            }
            catch
            {
                _connectionFactory.ResetConnection();
                throw;
            }
        }

        public UpdateDetailDto FetchUpdateDetail(string updateId, int? revisionNumber = null)
        {
            Guid parsedGuid;
            if (!Guid.TryParse(updateId, out parsedGuid))
                return null;

            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            IUpdateServer server = _connectionFactory.ConnectLocal();
            UpdateRevisionId revId = revisionNumber.HasValue
                ? new UpdateRevisionId(parsedGuid, revisionNumber.Value)
                : new UpdateRevisionId(parsedGuid);

            IUpdate update = server.GetUpdate(revId);
            if (update == null)
                return null;

            UpdateDto updateDto = MapUpdate(serverId, update);
            UpdateDetailDto detail = new UpdateDetailDto
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
                UpdateCollection superseding = update.GetRelatedUpdates(UpdateRelationship.UpdatesThatSupersedeThisUpdate);
                if (superseding != null)
                {
                    foreach (IUpdate sup in superseding)
                    {
                        detail.SupersededByUpdateIds.Add(sup.Id.UpdateId.ToString());
                    }
                }
            }
            catch
            {
                // Ignore if relationship metadata is unavailable
            }

            Dictionary<string, string> groupNames = BuildGroupNameLookup(server);
            foreach (IUpdateApproval approval in update.GetUpdateApprovals())
            {
                string groupIdStr = approval.ComputerTargetGroupId.ToString();
                string groupName;
                groupNames.TryGetValue(groupIdStr, out groupName);

                detail.Approvals.Add(new UpdateApprovalDto
                {
                    ApprovalId = approval.Id.ToString(),
                    Action = approval.Action.ToString(),
                    TargetGroupId = groupIdStr,
                    TargetGroupName = groupName ?? groupIdStr,
                    AdministratorName = approval.AdministratorName,
                    CreationDateUtc = ToNullableUtc(approval.CreationDate),
                    GoLiveTimeUtc = null,
                    DeadlineUtc = ToNullableUtc(approval.Deadline)
                });
            }

            Dictionary<string, IComputerTarget> computerLookup = new Dictionary<string, IComputerTarget>(StringComparer.OrdinalIgnoreCase);
            foreach (IComputerTarget ct in server.GetComputerTargets())
            {
                computerLookup[ct.Id] = ct;
            }

            foreach (IUpdateInstallationInfo info in update.GetUpdateInstallationInfoPerComputerTarget(new ComputerTargetScope()))
            {
                IComputerTarget target;
                computerLookup.TryGetValue(info.ComputerTargetId, out target);
                detail.ComputerStatuses.Add(new UpdateComputerStatusDto
                {
                    ComputerId = info.ComputerTargetId,
                    FullDomainName = target != null ? target.FullDomainName : info.ComputerTargetId,
                    IpAddress = (target != null && target.IPAddress != null) ? target.IPAddress.ToString() : string.Empty,
                    InstallationState = info.UpdateInstallationState.ToString(),
                    LastSyncTimeUtc = target != null ? ToNullableUtc(target.LastSyncTime) : null
                });
            }

            return detail;
        }

        public GroupDetailDto FetchGroupDetail(string groupId)
        {
            Guid parsedGroupId;
            if (!Guid.TryParse(groupId, out parsedGroupId))
                return null;

            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            IUpdateServer server = _connectionFactory.ConnectLocal();
            IComputerTargetGroup group = server.GetComputerTargetGroup(parsedGroupId);
            if (group == null)
                return null;

            List<ComputerDto> computers = new List<ComputerDto>();
            foreach (IComputerTarget target in group.GetComputerTargets())
            {
                computers.Add(MapComputer(serverId, target));
            }

            GroupDto groupDto = BuildGroupDto(serverId, group.Id.ToString(), group.Name, computers);
            return new GroupDetailDto
            {
                Group = groupDto,
                Computers = computers
            };
        }

        public GroupDto CreateComputerTargetGroup(string name)
        {
            IUpdateServer server = _connectionFactory.ConnectLocal();
            IComputerTargetGroup group = server.CreateComputerTargetGroup(name);
            WsusCacheService.Instance.InvalidateSnapshot();

            return new GroupDto
            {
                GroupId = group.Id.ToString(),
                ServerId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId,
                Name = group.Name
            };
        }

        public GroupDto AddComputerToGroup(string groupId, string computerId)
        {
            Guid parsedGroupId;
            if (!Guid.TryParse(groupId, out parsedGroupId))
                throw new ArgumentException("A valid groupId is required.", "groupId");

            IUpdateServer server = _connectionFactory.ConnectLocal();
            IComputerTargetGroup group = server.GetComputerTargetGroup(parsedGroupId);
            if (group == null)
                throw new KeyNotFoundException("Computer group was not found.");

            IComputerTarget target = server.GetComputerTarget(computerId);
            if (target == null)
                throw new KeyNotFoundException("Computer was not found.");

            group.AddComputerTarget(target);
            WsusCacheService.Instance.InvalidateSnapshot();

            return new GroupDto
            {
                GroupId = group.Id.ToString(),
                ServerId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId,
                Name = group.Name
            };
        }

        public void StartSynchronization()
        {
            IUpdateServer server = _connectionFactory.ConnectLocal();
            server.GetSubscription().StartSynchronization();
            WsusCacheService.Instance.InvalidateSnapshot();
        }

        public bool ApproveUpdate(string updateId, int? revisionNumber, string targetGroupId)
        {
            Guid parsedUpdateId;
            Guid parsedGroupId;
            if (!Guid.TryParse(updateId, out parsedUpdateId))
                throw new ArgumentException("A valid updateId is required.", "updateId");
            if (!Guid.TryParse(targetGroupId, out parsedGroupId))
                throw new ArgumentException("A valid targetGroupId is required.", "targetGroupId");

            IUpdateServer server = _connectionFactory.ConnectLocal();
            IComputerTargetGroup group = server.GetComputerTargetGroup(parsedGroupId);
            if (group == null)
                throw new KeyNotFoundException("Target computer group was not found.");

            UpdateRevisionId revisionId = revisionNumber.HasValue
                ? new UpdateRevisionId(parsedUpdateId, revisionNumber.Value)
                : new UpdateRevisionId(parsedUpdateId);
            IUpdate update = server.GetUpdate(revisionId);
            if (update == null)
                throw new KeyNotFoundException("Update was not found.");

            foreach (IUpdateApproval approval in update.GetUpdateApprovals())
            {
                if (approval.ComputerTargetGroupId == parsedGroupId &&
                    approval.Action == UpdateApprovalAction.Install)
                {
                    return true;
                }
            }

            update.Approve(UpdateApprovalAction.Install, group);
            WsusCacheService.Instance.InvalidateSnapshot();
            return false;
        }

        private List<ComputerDto> ReadComputers(IUpdateServer server, string serverId)
        {
            List<ComputerDto> result = new List<ComputerDto>();
            foreach (IComputerTarget target in server.GetComputerTargets())
            {
                result.Add(MapComputer(serverId, target));
            }
            return result;
        }

        private ComputerDto MapComputer(string serverId, IComputerTarget target)
        {
            IUpdateSummary summary = target.GetUpdateInstallationSummary();
            int installed = summary != null ? summary.InstalledCount : 0;
            int needed = summary != null ? (summary.NotInstalledCount + summary.DownloadedCount) : 0;
            int failed = summary != null ? summary.FailedCount : 0;
            int pendingReboot = summary != null ? summary.InstalledPendingRebootCount : 0;
            int notApplicable = summary != null ? summary.NotApplicableCount : 0;
            int unknown = summary != null ? summary.UnknownCount : 0;

            DateTime? lastSyncUtc = ToNullableUtc(target.LastSyncTime);
            List<string> assignedGroups = new List<string>();
            try
            {
                foreach (IComputerTargetGroup grp in target.GetComputerTargetGroups())
                {
                    assignedGroups.Add(grp.Name);
                }
            }
            catch
            {
                // Ignore group lookup issues on individual targets
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

            string osVer = (target.OSInfo != null && target.OSInfo.Version != null)
                ? string.Format("{0}.{1}.{2}",
                    target.OSInfo.Version.Major,
                    target.OSInfo.Version.Minor,
                    target.OSInfo.Version.Build)
                : null;

            string make = NullIfWhiteSpace(target.Make);
            string model = NullIfWhiteSpace(target.Model);
            string procArch = ReadTargetStringProperty(target, "ProcessorArchitecture");
            if (string.IsNullOrEmpty(procArch) && target.OSInfo != null)
            {
                procArch = ReadTargetStringProperty(target.OSInfo, "ProcessorArchitecture");
            }

            string biosVersion = null;
            DateTime? biosReleaseUtc = null;
            string biosVerOnly = null;
            if (target.BiosInfo != null)
            {
                string biosName = NullIfWhiteSpace(target.BiosInfo.Name);
                biosVerOnly = NullIfWhiteSpace(target.BiosInfo.Version);
                if (biosName != null && biosVerOnly != null && !string.Equals(biosName, biosVerOnly, StringComparison.OrdinalIgnoreCase))
                {
                    biosVersion = biosName + " " + biosVerOnly;
                }
                else
                {
                    biosVersion = biosVerOnly ?? biosName;
                }
                biosReleaseUtc = ToNullableUtc(target.BiosInfo.ReleaseDate);
            }

            string firmwareVersion = ReadTargetStringProperty(target, "FirmwareVersion") ?? biosVerOnly;
            string mobileOperator = ReadTargetStringProperty(target, "MobileOperator");

            return new ComputerDto
            {
                ComputerId = target.Id,
                ServerId = serverId,
                FullDomainName = target.FullDomainName,
                IpAddress = target.IPAddress != null ? target.IPAddress.ToString() : string.Empty,
                OsDescription = target.OSDescription ?? "Unknown",
                OsVersion = osVer,
                Make = make,
                Model = model,
                ProcessorArchitecture = procArch,
                BiosVersion = biosVersion,
                BiosReleaseDateUtc = biosReleaseUtc,
                FirmwareVersion = firmwareVersion,
                MobileOperator = mobileOperator,
                ClientVersion = target.ClientVersion != null ? target.ClientVersion.ToString() : string.Empty,
                ComputerRole = target.ComputerRole.ToString(),
                RequestedTargetGroup = target.RequestedTargetGroupName,
                AssignedTargetGroups = assignedGroups,
                LastSyncTimeUtc = lastSyncUtc,
                LastReportedStatusTimeUtc = ToNullableUtc(target.LastReportedStatusTime),
                LastReportedRebootTimeUtc = null,
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
            List<UpdateDto> result = new List<UpdateDto>();
            UpdateScope scope = new UpdateScope
            {
                ApprovedStates = ApprovedStates.Any,
                IncludedInstallationStates = UpdateInstallationStates.All
            };

            foreach (IUpdate update in server.GetUpdates(scope))
            {
                result.Add(MapUpdate(serverId, update));
            }

            return result;
        }

        private UpdateDto MapUpdate(string serverId, IUpdate update)
        {
            IUpdateSummary summary = null;
            try
            {
                summary = update.GetSummary(new ComputerTargetScope());
            }
            catch
            {
                // Ignore if summary is unavailable
            }

            List<string> products = new List<string>();
            try
            {
                foreach (IUpdateCategory cat in update.GetUpdateCategories())
                {
                    if (cat.Type == UpdateCategoryType.Product || cat.Type == UpdateCategoryType.ProductFamily)
                        products.Add(cat.Title);
                }
            }
            catch
            {
                // Ignore category read failure
            }

            bool requiresReboot = false;
            try
            {
                requiresReboot = update.InstallationBehavior != null &&
                                 update.InstallationBehavior.RebootBehavior != RebootBehavior.NeverReboots;
            }
            catch
            {
                // Ignore if InstallationBehavior is unavailable
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
                InstalledCount = summary != null ? summary.InstalledCount : 0,
                NeededCount = summary != null ? (summary.NotInstalledCount + summary.DownloadedCount) : 0,
                FailedCount = summary != null ? summary.FailedCount : 0,
                PendingRebootCount = summary != null ? summary.InstalledPendingRebootCount : 0,
                NotApplicableCount = summary != null ? summary.NotApplicableCount : 0,
                UnknownCount = summary != null ? summary.UnknownCount : 0
            };
        }

        private List<GroupDto> ReadGroups(IUpdateServer server, string serverId, List<ComputerDto> allComputers)
        {
            List<GroupDto> result = new List<GroupDto>();
            Dictionary<string, List<ComputerDto>> byGroupName =
                new Dictionary<string, List<ComputerDto>>(StringComparer.OrdinalIgnoreCase);

            foreach (ComputerDto c in allComputers)
            {
                foreach (string gName in c.AssignedTargetGroups)
                {
                    List<ComputerDto> list;
                    if (!byGroupName.TryGetValue(gName, out list))
                    {
                        list = new List<ComputerDto>();
                        byGroupName[gName] = list;
                    }
                    list.Add(c);
                }
            }

            foreach (IComputerTargetGroup group in server.GetComputerTargetGroups())
            {
                List<ComputerDto> members;
                byGroupName.TryGetValue(group.Name, out members);
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

        private SyncOverviewDto ReadSyncOverview(IUpdateServer server, string serverId, string serverName, int maxSyncHistoryItems)
        {
            ISubscription sub = server.GetSubscription();
            IUpdateServerConfiguration serverCfg = server.GetConfiguration();

            SyncSettingsDto settings = new SyncSettingsDto
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

            SynchronizationProgress progress = sub.GetSynchronizationProgress();
            SyncStatusDto currentStatus = new SyncStatusDto
            {
                Status = sub.GetSynchronizationStatus().ToString(),
                TotalItems = progress != null ? progress.TotalItems : 0,
                ProcessedItems = progress != null ? progress.ProcessedItems : 0,
                CurrentPhase = progress != null ? progress.Phase.ToString() : "Unknown"
            };

            List<SyncHistoryItemDto> history = new List<SyncHistoryItemDto>();
            foreach (ISynchronizationInfo info in sub.GetSynchronizationHistory())
            {
                DateTime? startUtc = ToNullableUtc(info.StartTime);
                DateTime? endUtc = ToNullableUtc(info.EndTime);
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
                    UpdateErrorsCount = info.UpdateErrors != null ? info.UpdateErrors.Count : 0
                });

                if (history.Count >= maxSyncHistoryItems)
                    break;
            }

            return new SyncOverviewDto
            {
                ServerId = serverId,
                ServerName = serverName,
                Settings = settings,
                CurrentStatus = currentStatus,
                History = history
            };
        }

        private static ServerSummaryDto BuildSummary(
            string serverId,
            string serverName,
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

            SyncHistoryItemDto lastSync = sync.History.FirstOrDefault();

            return new ServerSummaryDto
            {
                ServerId = serverId,
                ServerName = serverName,
                HostName = Environment.MachineName,
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
                LastSyncStartTimeUtc = lastSync != null ? lastSync.StartTimeUtc : null,
                LastSyncEndTimeUtc = lastSync != null ? lastSync.EndTimeUtc : null,
                LastSyncResult = lastSync != null ? lastSync.Result : "Unknown",
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
            Dictionary<string, string> dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
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

        private static string NullIfWhiteSpace(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static string ReadTargetStringProperty(object instance, string propertyName)
        {
            if (instance == null || string.IsNullOrEmpty(propertyName))
                return null;

            try
            {
                System.Reflection.PropertyInfo prop = instance.GetType().GetProperty(propertyName);
                if (prop == null)
                    return null;

                object val = prop.GetValue(instance, null);
                return val != null ? NullIfWhiteSpace(val.ToString()) : null;
            }
            catch
            {
                return null;
            }
        }
    }
}
