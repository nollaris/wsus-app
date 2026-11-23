using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Web.Http;
using WsusRestApi.Models;

namespace WsusRestApi.Controllers
{
    [RoutePrefix("api/v1/servers/{serverId}/computers")]
    public class ComputersController : WsusApiControllerBase
    {
        [HttpGet]
        [Route("")]
        public IHttpActionResult GetComputers(
            string serverId,
            string search = null,
            string group = null,
            string os = null,
            string status = null,
            int page = 1,
            int pageSize = 50)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            var snapErr = TryGetSnapshot(serverConfig, out var cached);
            if (snapErr != null) return snapErr;

            IEnumerable<ComputerDto> query = cached.Value.Computers;

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim();
                query = query.Where(c =>
                    (c.FullDomainName != null && c.FullDomainName.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (c.IpAddress != null && c.IpAddress.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (c.OsDescription != null && c.OsDescription.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0));
            }

            if (!string.IsNullOrWhiteSpace(group))
            {
                string g = group.Trim();
                query = query.Where(c =>
                    c.AssignedTargetGroups.Any(ag => string.Equals(ag, g, StringComparison.OrdinalIgnoreCase)));
            }

            if (!string.IsNullOrWhiteSpace(os))
            {
                string o = os.Trim();
                query = query.Where(c =>
                    c.OsDescription != null && c.OsDescription.IndexOf(o, StringComparison.OrdinalIgnoreCase) >= 0);
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                string st = status.Trim();
                query = query.Where(c =>
                    string.Equals(c.ComplianceStatus, st, StringComparison.OrdinalIgnoreCase));
            }

            var paged = Paginate(query.OrderBy(c => c.FullDomainName), page, pageSize);
            return Ok(ApiResponse<IReadOnlyList<ComputerDto>>.Ok(
                paged.Items,
                BuildMeta(serverConfig.Id, cached, paged.Pagination)));
        }

        [HttpGet]
        [Route("{computerId}")]
        public IHttpActionResult GetComputerDetails(string serverId, string computerId)
        {
            var serverErr = TryGetServer(serverId, out var serverConfig);
            if (serverErr != null) return serverErr;

            try
            {
                var cached = Cache.GetOrRefreshComputerDetail(serverConfig, computerId, DataService);
                if (cached.Value == null)
                {
                    return Content(
                        HttpStatusCode.NotFound,
                        ApiResponse<object>.Fail("COMPUTER_NOT_FOUND", $"Computer '{computerId}' was not found on '{serverId}'.", GetCorrelationId()));
                }

                return Ok(ApiResponse<ComputerDetailDto>.Ok(
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
