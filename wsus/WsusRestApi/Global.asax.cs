using System;
using System.Web;
using System.Web.Http;
using NLog;
using WsusRestApi.Services;

namespace WsusRestApi
{
    public class WebApiApplication : HttpApplication
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();

        protected void Application_Start()
        {
            Logger.Info("WSUS REST API starting up...");
            GlobalConfiguration.Configure(WebApiConfig.Register);
            WsusBackgroundRefreshService.Instance.Start();
            Logger.Info("WSUS REST API started successfully.");
        }

        protected void Application_End()
        {
            Logger.Info("WSUS REST API shutting down...");
            WsusBackgroundRefreshService.Instance.Dispose();
            LogManager.Shutdown();
        }
    }
}
