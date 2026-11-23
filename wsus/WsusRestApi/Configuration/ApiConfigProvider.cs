using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Web.Hosting;
using Newtonsoft.Json;
using NLog;

namespace WsusRestApi.Configuration
{
    public class NextJsClientConfig
    {
        public bool AuthEnabled { get; set; } = true;
        public List<string> ApiKeys { get; set; } = new List<string>();
        public List<string> BearerTokens { get; set; } = new List<string>();
        public List<string> AllowedOrigins { get; set; } = new List<string> { "http://localhost:3000" };
    }

    public class WsusSettingsConfig
    {
        public int CacheDurationMinutes { get; set; } = 5;
        public bool EnableBackgroundRefresh { get; set; } = true;
        public int MaxSyncHistoryItems { get; set; } = 50;
    }

    /// <summary>
    /// Loads and hot-reloads separated configuration files from Config\NextJs and Config\Wsus.
    /// </summary>
    public sealed class ApiConfigProvider
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();
        private static readonly Lazy<ApiConfigProvider> LazyInstance =
            new Lazy<ApiConfigProvider>(() => new ApiConfigProvider());

        private readonly object _nextJsLock = new object();
        private readonly object _wsusLock = new object();
        private readonly string _nextJsPath;
        private readonly string _wsusSettingsPath;

        private DateTime _nextJsLastWriteUtc = DateTime.MinValue;
        private DateTime _wsusLastWriteUtc = DateTime.MinValue;
        private NextJsClientConfig _nextJsConfig = new NextJsClientConfig();
        private WsusSettingsConfig _wsusSettings = new WsusSettingsConfig();

        public static ApiConfigProvider Instance => LazyInstance.Value;

        private ApiConfigProvider()
        {
            _nextJsPath = ResolvePath(
                ConfigurationManager.AppSettings["NextJs:ConfigPath"] ?? @"Config\NextJs\nextjs-client.json");
            _wsusSettingsPath = ResolvePath(
                ConfigurationManager.AppSettings["Wsus:SettingsPath"] ?? @"Config\Wsus\wsus-settings.json");
        }

        public NextJsClientConfig GetNextJsConfig()
        {
            return LoadOrReload(_nextJsPath, _nextJsLock, ref _nextJsLastWriteUtc, ref _nextJsConfig, "Next.js client config");
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

            var writeTime = File.GetLastWriteTimeUtc(path);
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
                    var parsed = JsonConvert.DeserializeObject<T>(json) ?? new T();
                    current = parsed;
                    lastWriteUtc = writeTime;
                    Logger.Info("Loaded {0} from {1}", label, path);
                }
                catch (Exception ex)
                {
                    Logger.Error(ex, "Failed to load {0} from {1}", label, path);
                }
                return current;
            }
        }
    }
}
