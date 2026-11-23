using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Http;
using System.Web.Http.ExceptionHandling;
using WsusRestApi.Models;

namespace WsusRestApi.Filters
{
    public sealed class GlobalExceptionHandler : ExceptionHandler
    {
        public override void Handle(ExceptionHandlerContext context)
        {
            string correlationId = context.Request.Properties.TryGetValue("CorrelationId", out var cid)
                ? cid?.ToString()
                : null;

            var payload = ApiResponse<object>.Fail(
                "INTERNAL_SERVER_ERROR",
                "An unexpected error occurred while processing the WSUS request.",
                correlationId);

            context.Result = new JsonErrorResult(context.Request, HttpStatusCode.InternalServerError, payload);
        }

        private sealed class JsonErrorResult : IHttpActionResult
        {
            private readonly HttpRequestMessage _request;
            private readonly HttpStatusCode _statusCode;
            private readonly ApiResponse<object> _payload;

            public JsonErrorResult(HttpRequestMessage request, HttpStatusCode statusCode, ApiResponse<object> payload)
            {
                _request = request;
                _statusCode = statusCode;
                _payload = payload;
            }

            public Task<HttpResponseMessage> ExecuteAsync(CancellationToken cancellationToken)
            {
                return Task.FromResult(_request.CreateResponse(_statusCode, _payload));
            }
        }
    }
}
