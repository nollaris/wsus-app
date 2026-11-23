using System.Linq;
using System.Web.Http;
using WsusRestApi.Models;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1/servers/{serverId}/sync")]
    public class SyncController : WsusApiControllerBase
    {
        [HttpGet]
        [Route("")]
        public IHttpActionResult GetSyncOverview(string serverId, int limit = 20)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            var snapErr = TryGetSnapshot(serverConfig, out var cached);
            if (snapErr != null) return snapErr;

            if (limit < 1) limit = 20;
            if (limit > 100) limit = 100;

            var source = cached.Value.Sync;
            var sliced = new SyncOverviewDto
            {
                ServerId = source.ServerId,
                ServerName = source.ServerName,
                Settings = source.Settings,
                CurrentStatus = source.CurrentStatus,
                History = source.History.Take(limit).ToList()
            };

            return Ok(ApiResponse<SyncOverviewDto>.Ok(
                sliced,
                BuildMeta(serverConfig.Id, cached)));
        }
    }
}
