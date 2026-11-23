using System;
using System.Collections.Generic;
using System.Web.Http;
using WsusRestApi.Models;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1/servers")]
    public class ServersController : WsusApiControllerBase
    {
        [HttpGet]
        [Route("")]
        public IHttpActionResult GetServers()
        {
            var servers = Registry.GetAllServers();
            var result = new List<ServerStatusDto>();

            foreach (var srv in servers)
            {
                result.Add(Cache.GetLastKnownStatus(srv));
            }

            return Ok(ApiResponse<List<ServerStatusDto>>.Ok(result, new ApiMeta
            {
                GeneratedAtUtc = DateTime.UtcNow,
                CorrelationId = GetCorrelationId()
            }));
        }
    }
}
