using System;
using System.Diagnostics;
using System.Threading;
using WsusRestApi.Configuration;
using WsusRestApi.Helpers;

namespace WsusRestApi.Services
{
    public sealed class WsusBackgroundRefreshService : IDisposable
    {
        private static readonly Lazy<WsusBackgroundRefreshService> LazyInstance =
            new Lazy<WsusBackgroundRefreshService>(() => new WsusBackgroundRefreshService());

        private readonly IWsusDataService _dataService = new WsusSdkDataService();
        private readonly WsusCacheService _cacheService = WsusCacheService.Instance;
        private Timer _timer;
        private int _isRefreshing;

        public static WsusBackgroundRefreshService Instance { get { return LazyInstance.Value; } }
        public DateTime StartedAtUtc { get; private set; }
        public DateTime? LastCycleCompletedUtc { get; private set; }

        private WsusBackgroundRefreshService()
        {
            StartedAtUtc = DateTime.UtcNow;
        }

        public void Start()
        {
            bool enabled = ApiConfigProvider.Instance.GetWsusSettings().EnableBackgroundRefresh;
            if (!enabled)
            {
                FileLogger.Info("Background WSUS refresh is disabled via configuration.");
                return;
            }

            TimeSpan interval = _cacheService.CacheDuration;
            FileLogger.Info(string.Format("Starting local WSUS background refresh service with interval {0} minute(s).", interval.TotalMinutes));
            _timer = new Timer(OnTimerTick, null, TimeSpan.FromSeconds(3), interval);
        }

        private void OnTimerTick(object state)
        {
            if (Interlocked.Exchange(ref _isRefreshing, 1) == 1)
            {
                FileLogger.Warn("Previous WSUS background refresh cycle is still running; skipping tick.");
                return;
            }

            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                _cacheService.GetOrRefreshSnapshot(_dataService, forceRefresh: true);
                sw.Stop();
                FileLogger.Info(string.Format("Refreshed local WSUS snapshot in {0} ms.", sw.ElapsedMilliseconds));
            }
            catch (Exception ex)
            {
                sw.Stop();
                _cacheService.RecordError(ex);
                FileLogger.Error(string.Format("Failed to refresh local WSUS snapshot after {0} ms.", sw.ElapsedMilliseconds), ex);
            }
            finally
            {
                LastCycleCompletedUtc = DateTime.UtcNow;
                Interlocked.Exchange(ref _isRefreshing, 0);
            }
        }

        public void Dispose()
        {
            if (_timer != null)
            {
                _timer.Dispose();
                _timer = null;
            }
        }
    }
}
