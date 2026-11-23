using System;
using System.Linq;
using System.Web.Http;
using WsusRestApi.Models;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1")]
    public class SummaryController : WsusApiControllerBase
    {
        [HttpGet]
        [Route("summary")]
        public IHttpActionResult GetGlobalSummary()
        {
            var enabledServers = Registry.GetEnabledServers();
            var global = new GlobalSummaryDto
            {
                TotalServers = enabledServers.Count
            };

            DateTime? oldestCache = null;
            DateTime? earliestExpiry = null;
            bool allFromCache = enabledServers.Count > 0;

            foreach (var srv in enabledServers)
            {
                try
                {
                    var cached = Cache.GetOrRefreshSnapshot(srv, DataService);
                    var s = cached.Value.Summary;
                    global.Servers.Add(s);
                    global.OnlineServers++;
                    global.TotalComputers += s.TotalComputers;
                    global.CompliantComputers += s.CompliantComputers;
                    global.ComputersNeedingUpdates += s.ComputersNeedingUpdates;
                    global.ComputersWithErrors += s.ComputersWithErrors;
                    global.StaleComputers += s.StaleComputers30Days;
                    global.TotalUpdates += s.TotalUpdates;
                    global.ApprovedUpdates += s.ApprovedUpdates;
                    global.DeclinedUpdates += s.DeclinedUpdates;
                    global.NeededUpdatesCount += s.UpdatesNeedingApproval;

                    if (!oldestCache.HasValue || cached.CachedAtUtc < oldestCache.Value)
                        oldestCache = cached.CachedAtUtc;
                    if (!earliestExpiry.HasValue || cached.ExpiresAtUtc < earliestExpiry.Value)
                        earliestExpiry = cached.ExpiresAtUtc;
                    if (!cached.FromCache)
                        allFromCache = false;
                }
                catch (Exception ex)
                {
                    Cache.RecordServerError(srv, ex);
                    global.Servers.Add(new ServerSummaryDto
                    {
                        ServerId = srv.Id,
                        ServerName = srv.Name,
                        HostName = srv.HostName,
                        IsOnline = false,
                        LastSyncResult = $"Error: {ex.Message}"
                    });
                    allFromCache = false;
                }
            }

            global.OverallCompliancePercent = global.TotalComputers > 0
                ? Math.Round((double)global.CompliantComputers / global.TotalComputers * 100.0, 2)
                : 100.0;

            return Ok(ApiResponse<GlobalSummaryDto>.Ok(global, new ApiMeta
            {
                ServerId = "all",
                GeneratedAtUtc = DateTime.UtcNow,
                CachedAtUtc = oldestCache,
                ExpiresAtUtc = earliestExpiry,
                FromCache = allFromCache,
                CorrelationId = GetCorrelationId()
            }));
        }

        [HttpGet]
        [Route("servers/{serverId}/summary")]
        public IHttpActionResult GetServerSummary(string serverId)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            var snapErr = TryGetSnapshot(serverConfig, out var cached);
            if (snapErr != null) return snapErr;

            return Ok(ApiResponse<ServerSummaryDto>.Ok(
                cached.Value.Summary,
                BuildMeta(serverConfig.Id, cached)));
        }
    }
}
