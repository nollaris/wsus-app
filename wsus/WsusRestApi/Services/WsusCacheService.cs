using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.Caching;
using System.Threading;
using WsusRestApi.Configuration;
using WsusRestApi.Models;

namespace WsusRestApi.Services
{
    public class CachedValue<T>
    {
        public T Value { get; set; }
        public DateTime CachedAtUtc { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
        public bool FromCache { get; set; }
    }

    public sealed class WsusCacheService
    {
        private static readonly Lazy<WsusCacheService> LazyInstance =
            new Lazy<WsusCacheService>(() => new WsusCacheService());

        private readonly ObjectCache _cache = MemoryCache.Default;
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _keyLocks =
            new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.OrdinalIgnoreCase);

        public static WsusCacheService Instance { get { return LazyInstance.Value; } }
        public TimeSpan CacheDuration { get; private set; }
        public string LastError { get; private set; }
        public DateTime? LastRefreshedUtc { get; private set; }

        private WsusCacheService()
        {
            int minutes = ApiConfigProvider.Instance.GetWsusSettings().CacheDurationMinutes;
            if (minutes <= 0) minutes = 5;
            CacheDuration = TimeSpan.FromMinutes(minutes);
        }

        public CachedValue<WsusLocalSnapshot> GetOrRefreshSnapshot(
            IWsusDataService dataService,
            bool forceRefresh = false)
        {
            return GetOrAdd("wsus:local:snapshot", () =>
            {
                WsusLocalSnapshot snapshot = dataService.FetchLocalSnapshot();
                LastRefreshedUtc = snapshot.CapturedAtUtc;
                LastError = null;
                return snapshot;
            }, forceRefresh);
        }

        public void RecordError(Exception ex)
        {
            LastError = ex.Message;
        }

        public void InvalidateSnapshot()
        {
            List<string> keys = new List<string>();
            foreach (KeyValuePair<string, object> item in _cache)
            {
                if (item.Key.StartsWith("wsus:local:", StringComparison.OrdinalIgnoreCase))
                {
                    keys.Add(item.Key);
                }
            }
            foreach (string key in keys)
            {
                _cache.Remove(key);
            }
        }

        public CachedValue<ComputerDetailDto> GetOrRefreshComputerDetail(string computerId, IWsusDataService dataService)
        {
            string key = string.Format("wsus:local:computer-detail:{0}", computerId.ToLowerInvariant());
            return GetOrAdd(key, () => dataService.FetchComputerDetail(computerId));
        }

        public CachedValue<UpdateDetailDto> GetOrRefreshUpdateDetail(string updateId, int? revisionNumber, IWsusDataService dataService)
        {
            string revPart = revisionNumber.HasValue ? revisionNumber.Value.ToString() : "latest";
            string key = string.Format("wsus:local:update-detail:{0}:{1}", updateId.ToLowerInvariant(), revPart);
            return GetOrAdd(key, () => dataService.FetchUpdateDetail(updateId, revisionNumber));
        }

        public CachedValue<GroupDetailDto> GetOrRefreshGroupDetail(string groupId, IWsusDataService dataService)
        {
            string key = string.Format("wsus:local:group-detail:{0}", groupId.ToLowerInvariant());
            return GetOrAdd(key, () => dataService.FetchGroupDetail(groupId));
        }

        private CachedValue<T> GetOrAdd<T>(string key, Func<T> factory, bool forceRefresh = false)
        {
            CachedEnvelope<T> existing = !forceRefresh ? (_cache.Get(key) as CachedEnvelope<T>) : null;
            if (existing != null)
            {
                return new CachedValue<T>
                {
                    Value = existing.Value,
                    CachedAtUtc = existing.CachedAtUtc,
                    ExpiresAtUtc = existing.ExpiresAtUtc,
                    FromCache = true
                };
            }

            SemaphoreSlim keyLock = _keyLocks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
            keyLock.Wait();
            try
            {
                CachedEnvelope<T> doubleChecked = !forceRefresh ? (_cache.Get(key) as CachedEnvelope<T>) : null;
                if (doubleChecked != null)
                {
                    return new CachedValue<T>
                    {
                        Value = doubleChecked.Value,
                        CachedAtUtc = doubleChecked.CachedAtUtc,
                        ExpiresAtUtc = doubleChecked.ExpiresAtUtc,
                        FromCache = true
                    };
                }

                T value = factory();
                DateTime now = DateTime.UtcNow;
                DateTime expires = now.Add(CacheDuration);

                if (value != null)
                {
                    CachedEnvelope<T> envelope = new CachedEnvelope<T>
                    {
                        Value = value,
                        CachedAtUtc = now,
                        ExpiresAtUtc = expires
                    };
                    _cache.Set(key, envelope, new CacheItemPolicy
                    {
                        AbsoluteExpiration = new DateTimeOffset(expires)
                    });
                }

                return new CachedValue<T>
                {
                    Value = value,
                    CachedAtUtc = now,
                    ExpiresAtUtc = expires,
                    FromCache = false
                };
            }
            finally
            {
                keyLock.Release();
            }
        }

        private sealed class CachedEnvelope<T>
        {
            public T Value { get; set; }
            public DateTime CachedAtUtc { get; set; }
            public DateTime ExpiresAtUtc { get; set; }
        }
    }
}
