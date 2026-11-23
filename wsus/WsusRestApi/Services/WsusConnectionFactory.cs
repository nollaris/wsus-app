using Microsoft.UpdateServices.Administration;
using WsusRestApi.Helpers;

namespace WsusRestApi.Services
{
    /// <summary>
    /// Connects strictly to the local WSUS server on this host (no remoting).
    /// </summary>
    public sealed class WsusConnectionFactory
    {
        public IUpdateServer ConnectLocal()
        {
            FileLogger.Info("Connecting to local WSUS server instance.");
            return AdminProxy.GetUpdateServer();
        }
    }
}
