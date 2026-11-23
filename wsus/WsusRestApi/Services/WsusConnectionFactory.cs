using System;
using Microsoft.UpdateServices.Administration;
using NLog;
using WsusRestApi.Configuration;

namespace WsusRestApi.Services
{
    /// <summary>
    /// Creates read-only connections to remote or local WSUS servers via AdminProxy.
    /// </summary>
    public sealed class WsusConnectionFactory
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();

        public IUpdateServer Connect(WsusServerConfig config)
        {
            if (config == null)
                throw new ArgumentNullException(nameof(config));

            Logger.Debug("Connecting to WSUS server '{0}' ({1}:{2}, SSL={3})",
                config.Id, config.HostName, config.Port, config.UseSsl);

            return AdminProxy.GetUpdateServer(config.HostName, config.UseSsl, config.Port);
        }
    }
}
