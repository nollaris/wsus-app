using System;
using System.Configuration;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using NLog;
using WsusRestApi.Configuration;

namespace WsusRestApi.Services
{
    /// <summary>
    /// Periodically refreshes all enabled WSUS servers every 5 minutes in the background
    /// so Next.js requests always hit warm MemoryCache entries.
    /// </summary>
    public sealed class WsusBackgroundRefreshService : IDisposable
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();
        private static readonly Lazy<WsusBackgroundRefreshService> LazyInstance =
            new Lazy<WsusBackgroundRefreshService>(() => new WsusBackgroundRefreshService());

        private readonly IWsusDataService _dataService = new WsusSdkDataService();
        private readonly WsusCacheService _cacheService = WsusCacheService.Instance;
        private Timer _timer;
        private int _isRefreshing;

        public static WsusBackgroundRefreshService Instance => LazyInstance.Value;
        public DateTime StartedAtUtc { get; } = DateTime.UtcNow;
        public DateTime? LastCycleCompletedUtc { get; private set; }

        private WsusBackgroundRefreshService()
        {
        }

        public void Start()
        {
            bool enabled = ApiConfigProvider.Instance.GetWsusSettings().EnableBackgroundRefresh;

            if (!enabled)
            {
                Logger.Info("Background WSUS refresh is disabled via configuration.");
                return;
            }

            TimeSpan interval = _cacheService.CacheDuration;
            Logger.Info("Starting WSUS background refresh service with interval {0} minute(s).", interval.TotalMinutes);

            // Run initial warm-up shortly after startup, then every 5 minutes
            _timer = new Timer(OnTimerTick, null, TimeSpan.FromSeconds(3), interval);
        }

        private void OnTimerTick(object state)
        {
            if (Interlocked.Exchange(ref _isRefreshing, 1) == 1)
            {
                Logger.Warn("Previous WSUS background refresh cycle is still running; skipping tick.");
                return;
            }

            try
            {
                RefreshAllEnabledServers();
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Unhandled error in WSUS background refresh cycle.");
            }
            finally
            {
                LastCycleCompletedUtc = DateTime.UtcNow;
                Interlocked.Exchange(ref _isRefreshing, 0);
            }
        }

        public void RefreshAllEnabledServers()
        {
            var servers = WsusServerRegistry.Instance.GetEnabledServers();
            if (servers.Count == 0)
            {
                Logger.Warn("No enabled WSUS servers found in registry.");
                return;
            }

            var sw = Stopwatch.StartNew();
            Logger.Info("Starting 5-minute refresh cycle for {0} enabled WSUS server(s).", servers.Count);

            Parallel.ForEach(servers, server =>
            {
                var serverSw = Stopwatch.StartNew();
                try
                {
                    _cacheService.GetOrRefreshSnapshot(server, _dataService, forceRefresh: true);
                    serverSw.Stop();
                    Logger.Info("Refreshed WSUS server '{0}' ({1}) in {2} ms.",
                        server.Id, server.HostName, serverSw.ElapsedMilliseconds);
                }
                catch (Exception ex)
                {
                    serverSw.Stop();
                    _cacheService.RecordServerError(server, ex);
                    Logger.Error(ex, "Failed to refresh WSUS server '{0}' ({1}) after {2} ms.",
                        server.Id, server.HostName, serverSw.ElapsedMilliseconds);
                }
            });

            sw.Stop();
            Logger.Info("Completed WSUS refresh cycle in {0} ms.", sw.ElapsedMilliseconds);
        }

        public void Dispose()
        {
            _timer?.Dispose();
            _timer = null;
        }
    }
}
