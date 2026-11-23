using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Web.Http;
using WsusRestApi.Models;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1/servers/{serverId}/groups")]
    public class GroupsController : WsusApiControllerBase
    {
        [HttpGet]
        [Route("")]
        public IHttpActionResult GetGroups(string serverId)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            var snapErr = TryGetSnapshot(serverConfig, out var cached);
            if (snapErr != null) return snapErr;

            var groups = cached.Value.Groups.OrderBy(g => g.Name).ToList();
            return Ok(ApiResponse<List<GroupDto>>.Ok(
                groups,
                BuildMeta(serverConfig.Id, cached)));
        }

        [HttpGet]
        [Route("{groupId}")]
        public IHttpActionResult GetGroupDetails(string serverId, string groupId)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            try
            {
                var cached = Cache.GetOrRefreshGroupDetail(serverConfig, groupId, DataService);
                if (cached.Value == null)
                {
                    return Content(
                        HttpStatusCode.NotFound,
                        ApiResponse<object>.Fail("GROUP_NOT_FOUND", $"Target group '{groupId}' was not found on '{serverId}'.", GetCorrelationId()));
                }

                return Ok(ApiResponse<GroupDetailDto>.Ok(
                    cached.Value,
                    BuildMeta(serverConfig.Id, cached)));
            }
            catch (Exception ex)
            {
                return Content(
                    HttpStatusCode.BadGateway,
                    ApiResponse<object>.Fail("WSUS_QUERY_FAILED", ex.Message, GetCorrelationId()));
            }
        }
    }
}
