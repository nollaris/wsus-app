using System;
using System.Web.Http;
using WsusRestApi.Configuration;
using WsusRestApi.Models;
using WsusRestApi.Services;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1/health")]
    public class HealthController : WsusApiControllerBase
    {
        [HttpGet]
        [AllowAnonymous]
        [Route("")]
        public IHttpActionResult GetHealth()
        {
            var refresher = WsusBackgroundRefreshService.Instance;
            var servers = Registry.GetAllServers();

            var payload = new
            {
                status = "Healthy",
                readOnly = true,
                startedAtUtc = refresher.StartedAtUtc,
                uptimeSeconds = Math.Round((DateTime.UtcNow - refresher.StartedAtUtc).TotalSeconds, 0),
                cacheDurationMinutes = Cache.CacheDuration.TotalMinutes,
                lastRefreshCycleCompletedUtc = refresher.LastCycleCompletedUtc,
                configuredServers = servers.Count
            };

            return Ok(ApiResponse<object>.Ok(payload, new ApiMeta
            {
                GeneratedAtUtc = DateTime.UtcNow,
                CorrelationId = GetCorrelationId()
            }));
        }
    }
}
