using System;
using Microsoft.UpdateServices.Administration;
using WsusRestApi.Helpers;

namespace WsusRestApi.Services
{
    /// <summary>
    /// Connects strictly to the local WSUS server on this host (no remoting).
    /// Reuses the IUpdateServer instance across requests and resets it on error.
    /// </summary>
    public sealed class WsusConnectionFactory
    {
        private readonly object _syncRoot = new object();
        private IUpdateServer _cachedServer;

        public IUpdateServer ConnectLocal()
        {
            IUpdateServer existing = _cachedServer;
            if (existing != null)
                return existing;

            lock (_syncRoot)
            {
                if (_cachedServer == null)
                {
                    FileLogger.Info("Connecting to local WSUS server instance.");
                    _cachedServer = AdminProxy.GetUpdateServer();
                }
                return _cachedServer;
            }
        }

        public void ResetConnection()
        {
            lock (_syncRoot)
            {
                if (_cachedServer != null)
                {
                    FileLogger.Warn("Resetting cached local WSUS server connection.");
                    _cachedServer = null;
                }
            }
        }
    }
}
