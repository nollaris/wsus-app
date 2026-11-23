using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Linq;
using System.Web.Hosting;
using Newtonsoft.Json;
using NLog;

namespace WsusRestApi.Configuration
{
    /// <summary>
    /// Thread-safe registry for multi-WSUS server configurations loaded from App_Data/wsus-servers.json.
    /// Automatically reloads when the config file timestamp changes.
    /// </summary>
    public sealed class WsusServerRegistry
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();
        private static readonly Lazy<WsusServerRegistry> LazyInstance =
            new Lazy<WsusServerRegistry>(() => new WsusServerRegistry());

        private readonly object _syncLock = new object();
        private readonly string _configPath;
        private DateTime _lastLoadedWriteTimeUtc = DateTime.MinValue;
        private List<WsusServerConfig> _servers = new List<WsusServerConfig>();

        public static WsusServerRegistry Instance => LazyInstance.Value;

        private WsusServerRegistry()
        {
            var configuredPath = ConfigurationManager.AppSettings["Wsus:ServersConfigPath"]
                                 ?? @"Config\Wsus\wsus-servers.json";

            _configPath = ApiConfigProvider.ResolvePath(configuredPath);

            EnsureLoaded();
        }

        public IReadOnlyList<WsusServerConfig> GetAllServers()
        {
            EnsureLoaded();
            lock (_syncLock)
            {
                return _servers.ToList().AsReadOnly();
            }
        }

        public IReadOnlyList<WsusServerConfig> GetEnabledServers()
        {
            EnsureLoaded();
            lock (_syncLock)
            {
                return _servers.Where(s => s.Enabled).ToList().AsReadOnly();
            }
        }

        public WsusServerConfig GetServerById(string serverId)
        {
            if (string.IsNullOrWhiteSpace(serverId))
                return null;

            EnsureLoaded();
            lock (_syncLock)
            {
                return _servers.FirstOrDefault(s =>
                    string.Equals(s.Id, serverId, StringComparison.OrdinalIgnoreCase));
            }
        }

        private void EnsureLoaded()
        {
            if (!File.Exists(_configPath))
            {
                Logger.Warn("WSUS server config file not found at {0}", _configPath);
                return;
            }

            var writeTimeUtc = File.GetLastWriteTimeUtc(_configPath);
            if (writeTimeUtc <= _lastLoadedWriteTimeUtc)
                return;

            lock (_syncLock)
            {
                writeTimeUtc = File.GetLastWriteTimeUtc(_configPath);
                if (writeTimeUtc <= _lastLoadedWriteTimeUtc)
                    return;

                try
                {
                    var json = File.ReadAllText(_configPath);
                    var parsed = JsonConvert.DeserializeObject<List<WsusServerConfig>>(json)
                                 ?? new List<WsusServerConfig>();

                    foreach (var s in parsed)
                    {
                        if (string.IsNullOrWhiteSpace(s.Id))
                            throw new InvalidOperationException("Each WSUS server entry must have a non-empty 'id'.");
                        if (string.IsNullOrWhiteSpace(s.HostName))
                            throw new InvalidOperationException($"WSUS server '{s.Id}' must have a 'hostName'.");
                        if (s.Port <= 0)
                            s.Port = s.UseSsl ? 8531 : 8530;
                    }

                    _servers = parsed;
                    _lastLoadedWriteTimeUtc = writeTimeUtc;
                    Logger.Info("Loaded {0} WSUS server configuration(s) from {1}", _servers.Count, _configPath);
                }
                catch (Exception ex)
                {
                    Logger.Error(ex, "Failed to load WSUS server configuration from {0}", _configPath);
                    throw;
                }
            }
        }
    }
}
