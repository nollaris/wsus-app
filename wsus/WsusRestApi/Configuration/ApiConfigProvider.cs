using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Web.Hosting;
using WsusRestApi.Helpers;

namespace WsusRestApi.Configuration
{
    public class ApiSecurityConfig
    {
        public ApiSecurityConfig()
        {
            AuthEnabled = true;
            ApiKeys = new List<string>();
            BearerTokens = new List<string>();
            AllowedOrigins = new List<string> { "*" };
        }

        public bool AuthEnabled { get; set; }
        public List<string> ApiKeys { get; set; }
        public List<string> BearerTokens { get; set; }
        public List<string> AllowedOrigins { get; set; }
    }

    public class WsusSettingsConfig
    {
        public WsusSettingsConfig()
        {
            ServerId = string.Empty;
            ServerName = string.Empty;
            CacheDurationMinutes = 5;
            EnableBackgroundRefresh = true;
            MaxSyncHistoryItems = 50;
        }

        public string ServerId { get; set; }
        public string ServerName { get; set; }
        public int CacheDurationMinutes { get; set; }
        public bool EnableBackgroundRefresh { get; set; }
        public int MaxSyncHistoryItems { get; set; }

        public string ResolvedServerId
        {
            get
            {
                return string.IsNullOrWhiteSpace(ServerId)
                    ? Environment.MachineName.ToLowerInvariant()
                    : ServerId.Trim();
            }
        }

        public string ResolvedServerName
        {
            get
            {
                return string.IsNullOrWhiteSpace(ServerName)
                    ? Environment.MachineName
                    : ServerName.Trim();
            }
        }
    }

    public sealed class ApiConfigProvider
    {
        private static readonly Lazy<ApiConfigProvider> LazyInstance =
            new Lazy<ApiConfigProvider>(() => new ApiConfigProvider());

        private readonly object _securityLock = new object();
        private readonly object _wsusLock = new object();
        private readonly string _securityPath;
        private readonly string _wsusSettingsPath;

        private DateTime _securityLastWriteUtc = DateTime.MinValue;
        private DateTime _wsusLastWriteUtc = DateTime.MinValue;
        private ApiSecurityConfig _securityConfig = new ApiSecurityConfig();
        private WsusSettingsConfig _wsusSettings = new WsusSettingsConfig();

        public static ApiConfigProvider Instance { get { return LazyInstance.Value; } }

        private ApiConfigProvider()
        {
            _securityPath = ResolvePath(
                ConfigurationManager.AppSettings["Api:SecurityConfigPath"] ?? @"Config\security.json");
            _wsusSettingsPath = ResolvePath(
                ConfigurationManager.AppSettings["Wsus:SettingsPath"] ?? @"Config\Wsus\wsus-settings.json");
        }

        public ApiSecurityConfig GetSecurityConfig()
        {
            return LoadOrReload(_securityPath, _securityLock, ref _securityLastWriteUtc, ref _securityConfig, "API security config");
        }

        public WsusSettingsConfig GetWsusSettings()
        {
            return LoadOrReload(_wsusSettingsPath, _wsusLock, ref _wsusLastWriteUtc, ref _wsusSettings, "WSUS settings config");
        }

        public static string ResolvePath(string configuredPath)
        {
            if (Path.IsPathRooted(configuredPath))
                return configuredPath;

            string webRelative = "~/" + configuredPath.TrimStart('~', '/', '\\').Replace('\\', '/');
            return HostingEnvironment.MapPath(webRelative)
                   ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, configuredPath);
        }

        private static T LoadOrReload<T>(
            string path,
            object syncLock,
            ref DateTime lastWriteUtc,
            ref T current,
            string label) where T : class, new()
        {
            if (!File.Exists(path))
                return current;

            DateTime writeTime = File.GetLastWriteTimeUtc(path);
            if (writeTime <= lastWriteUtc)
                return current;

            lock (syncLock)
            {
                writeTime = File.GetLastWriteTimeUtc(path);
                if (writeTime <= lastWriteUtc)
                    return current;

                try
                {
                    string json = File.ReadAllText(path);
                    T parsed = JsonHelper.Deserialize<T>(json) ?? new T();
                    current = parsed;
                    lastWriteUtc = writeTime;
                    FileLogger.Info(string.Format("Loaded {0} from {1}", label, path));
                }
                catch (Exception ex)
                {
                    FileLogger.Error(string.Format("Failed to load {0} from {1}", label, path), ex);
                }
                return current;
            }
        }
    }
}
