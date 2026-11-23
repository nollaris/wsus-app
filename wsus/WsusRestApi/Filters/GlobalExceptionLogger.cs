using System.Web.Http.ExceptionHandling;
using NLog;

namespace WsusRestApi.Filters
{
    public sealed class GlobalExceptionLogger : ExceptionLogger
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();

        public override void Log(ExceptionLoggerContext context)
        {
            Logger.Error(
                context.Exception,
                "Unhandled exception during {0} {1}",
                context.Request?.Method,
                context.Request?.RequestUri);
        }
    }
}
