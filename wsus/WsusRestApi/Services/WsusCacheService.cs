using System;
using System.Collections.Concurrent;
using System.Configuration;
using System.Runtime.Caching;
using System.Threading;
using NLog;
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

    /// <summary>
    /// Thread-safe MemoryCache service with 5-minute TTL and per-key locking to prevent cache stampedes.
    /// </summary>
    public sealed class WsusCacheService
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();
        private static readonly Lazy<WsusCacheService> LazyInstance =
            new Lazy<WsusCacheService>(() => new WsusCacheService());

        private readonly ObjectCache _cache = MemoryCache.Default;
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _keyLocks =
            new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, ServerStatusDto> _lastKnownStatuses =
            new ConcurrentDictionary<string, ServerStatusDto>(StringComparer.OrdinalIgnoreCase);

        public static WsusCacheService Instance => LazyInstance.Value;

        public TimeSpan CacheDuration { get; }

        private WsusCacheService()
        {
            int minutes = ApiConfigProvider.Instance.GetWsusSettings().CacheDurationMinutes;
            if (minutes <= 0)
            {
                minutes = 5;
            }
            CacheDuration = TimeSpan.FromMinutes(minutes);
        }

        public CachedValue<WsusServerSnapshot> GetOrRefreshSnapshot(
            WsusServerConfig server,
            IWsusDataService dataService,
            bool forceRefresh = false)
        {
            string key = $"wsus:snapshot:{server.Id.ToLowerInvariant()}";
            return GetOrAdd(key, () =>
            {
                var snapshot = dataService.FetchServerSnapshot(server);
                snapshot.Status.NextRefreshUtc = snapshot.CapturedAtUtc.Add(CacheDuration);
                _lastKnownStatuses[server.Id] = snapshot.Status;
                return snapshot;
            }, forceRefresh);
        }

        public void RecordServerError(WsusServerConfig server, Exception ex)
        {
            _lastKnownStatuses.AddOrUpdate(
                server.Id,
                _ => new ServerStatusDto
                {
                    Id = server.Id,
                    Name = server.Name,
                    HostName = server.HostName,
                    Port = server.Port,
                    UseSsl = server.UseSsl,
                    Enabled = server.Enabled,
                    Description = server.Description,
                    IsOnline = false,
                    LastRefreshedUtc = null,
                    NextRefreshUtc = DateTime.UtcNow.Add(CacheDuration),
                    LastError = ex.Message
                },
                (_, existing) =>
                {
                    existing.IsOnline = false;
                    existing.NextRefreshUtc = DateTime.UtcNow.Add(CacheDuration);
                    existing.LastError = ex.Message;
                    return existing;
                });
        }

        public ServerStatusDto GetLastKnownStatus(WsusServerConfig server)
        {
            if (_lastKnownStatuses.TryGetValue(server.Id, out var status))
                return status;

            return new ServerStatusDto
            {
                Id = server.Id,
                Name = server.Name,
                HostName = server.HostName,
                Port = server.Port,
                UseSsl = server.UseSsl,
                Enabled = server.Enabled,
                Description = server.Description,
                IsOnline = false,
                LastError = server.Enabled ? "Not yet refreshed" : "Server disabled"
            };
        }

        public CachedValue<ComputerDetailDto> GetOrRefreshComputerDetail(
            WsusServerConfig server,
            string computerId,
            IWsusDataService dataService)
        {
            string key = $"wsus:computer-detail:{server.Id.ToLowerInvariant()}:{computerId.ToLowerInvariant()}";
            return GetOrAdd(key, () => dataService.FetchComputerDetail(server, computerId));
        }

        public CachedValue<UpdateDetailDto> GetOrRefreshUpdateDetail(
            WsusServerConfig server,
            string updateId,
            int? revisionNumber,
            IWsusDataService dataService)
        {
            string revPart = revisionNumber.HasValue ? revisionNumber.Value.ToString() : "latest";
            string key = $"wsus:update-detail:{server.Id.ToLowerInvariant()}:{updateId.ToLowerInvariant()}:{revPart}";
            return GetOrAdd(key, () => dataService.FetchUpdateDetail(server, updateId, revisionNumber));
        }

        public CachedValue<GroupDetailDto> GetOrRefreshGroupDetail(
            WsusServerConfig server,
            string groupId,
            IWsusDataService dataService)
        {
            string key = $"wsus:group-detail:{server.Id.ToLowerInvariant()}:{groupId.ToLowerInvariant()}";
            return GetOrAdd(key, () => dataService.FetchGroupDetail(server, groupId));
        }

        private CachedValue<T> GetOrAdd<T>(string key, Func<T> factory, bool forceRefresh = false)
        {
            if (!forceRefresh && _cache.Get(key) is CachedEnvelope<T> existing)
            {
                return new CachedValue<T>
                {
                    Value = existing.Value,
                    CachedAtUtc = existing.CachedAtUtc,
                    ExpiresAtUtc = existing.ExpiresAtUtc,
                    FromCache = true
                };
            }

            var keyLock = _keyLocks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
            keyLock.Wait();
            try
            {
                if (!forceRefresh && _cache.Get(key) is CachedEnvelope<T> doubleChecked)
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
                var now = DateTime.UtcNow;
                var expires = now.Add(CacheDuration);

                if (value != null)
                {
                    var envelope = new CachedEnvelope<T>
                    {
                        Value = value,
                        CachedAtUtc = now,
                        ExpiresAtUtc = expires
                    };
                    _cache.Set(key, envelope, new CacheItemPolicy
                    {
                        AbsoluteExpiration = new DateTimeOffset(expires)
                    });
                    Logger.Debug("Cached key '{0}' until {1:O}", key, expires);
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
