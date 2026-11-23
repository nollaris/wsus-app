using System.Net;
using System.Net.Http;
using System.Web.Http.Controllers;
using System.Web.Http.Filters;
using WsusRestApi.Models;

namespace WsusRestApi.Filters
{
    /// <summary>
    /// Enforces strictly read-only HTTP access (GET, HEAD, OPTIONS only).
    /// </summary>
    public sealed class ReadOnlyGuardFilter : ActionFilterAttribute
    {
        public override void OnActionExecuting(HttpActionContext actionContext)
        {
            var method = actionContext.Request.Method;
            if (method != HttpMethod.Get &&
                method != HttpMethod.Head &&
                method != HttpMethod.Options)
            {
                string correlationId = actionContext.Request.Properties.TryGetValue("CorrelationId", out var cid)
                    ? cid?.ToString()
                    : null;

                actionContext.Response = actionContext.Request.CreateResponse(
                    HttpStatusCode.MethodNotAllowed,
                    ApiResponse<object>.Fail(
                        "READ_ONLY_API",
                        "This WSUS API is strictly read-only. Only GET, HEAD, and OPTIONS requests are permitted.",
                        correlationId));
            }
        }
    }
}
