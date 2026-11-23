using System;
using System.Web;
using WsusRestApi.Helpers;
using WsusRestApi.Services;

namespace WsusRestApi
{
    public class WebApiApplication : HttpApplication
    {
        protected void Application_Start()
        {
            FileLogger.Info("WSUS REST API starting up...");
            WsusBackgroundRefreshService.Instance.Start();
            FileLogger.Info("WSUS REST API started successfully.");
        }

        protected void Application_End()
        {
            FileLogger.Info("WSUS REST API shutting down...");
            WsusBackgroundRefreshService.Instance.Dispose();
        }
    }
}
