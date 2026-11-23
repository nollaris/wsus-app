using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using NLog;

namespace WsusRestApi.Handlers
{
    /// <summary>
    /// Logs every HTTP request with correlation ID, client IP, status code, and execution duration.
    /// </summary>
    public sealed class RequestLoggingHandler : DelegatingHandler
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();
        private const string CorrelationHeader = "X-Correlation-Id";

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            string correlationId = null;
            if (request.Headers.TryGetValues(CorrelationHeader, out var values))
            {
                correlationId = values.FirstOrDefault();
            }
            if (string.IsNullOrWhiteSpace(correlationId))
            {
                correlationId = Guid.NewGuid().ToString("N");
            }

            request.Properties["CorrelationId"] = correlationId;
            string clientIp = GetClientIp(request);
            var sw = Stopwatch.StartNew();

            using (MappedDiagnosticsLogicalContext.SetScoped("CorrelationId", correlationId))
            {
                HttpResponseMessage response = await base.SendAsync(request, cancellationToken);
                sw.Stop();

                response.Headers.TryAddWithoutValidation(CorrelationHeader, correlationId);
                Logger.Info(
                    "{0} {1} -> {2} ({3} ms) [IP={4}]",
                    request.Method,
                    request.RequestUri?.PathAndQuery,
                    (int)response.StatusCode,
                    sw.ElapsedMilliseconds,
                    clientIp);

                return response;
            }
        }

        private static string GetClientIp(HttpRequestMessage request)
        {
            if (request.Properties.TryGetValue("MS_HttpContext", out var ctxObj) &&
                ctxObj is HttpContextWrapper ctx)
            {
                return ctx.Request.UserHostAddress ?? "unknown";
            }
            return "unknown";
        }
    }
}
