using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Web;
using WsusRestApi.Configuration;
using WsusRestApi.Helpers;
using WsusRestApi.Models;
using WsusRestApi.Services;

namespace WsusRestApi
{
    public sealed class WsusRouterHandler : IHttpHandler
    {
        public bool IsReusable { get { return true; } }

        private static readonly WsusCacheService Cache = WsusCacheService.Instance;
        private static readonly IWsusDataService DataService = new WsusSdkDataService();

        public void ProcessRequest(HttpContext context)
        {
            Stopwatch sw = Stopwatch.StartNew();
            string correlationId = context.Request.Headers["X-Correlation-Id"];
            if (string.IsNullOrWhiteSpace(correlationId))
                correlationId = Guid.NewGuid().ToString("N");

            context.Response.Headers["X-Correlation-Id"] = correlationId;
            ApplyCorsHeaders(context);

            string method = context.Request.HttpMethod.ToUpperInvariant();
            if (method == "OPTIONS")
            {
                context.Response.StatusCode = 204;
                return;
            }

            if (method != "GET" && method != "HEAD")
            {
                WriteJson(context, 405, ApiResponse<object>.Fail(
                    "READ_ONLY_API",
                    "This WSUS API is strictly read-only. Only GET, HEAD, and OPTIONS requests are permitted.",
                    correlationId));
                return;
            }

            string route = ExtractApiRelativeRoute(context);

            try
            {
                if (string.Equals(route, "health", StringComparison.OrdinalIgnoreCase))
                {
                    HandleHealth(context, correlationId);
                    LogRequest(context, sw, correlationId);
                    return;
                }

                if (!IsAuthorized(context))
                {
                    FileLogger.Warn(string.Format("Unauthorized request: {0} {1} [IP={2}]",
                        method, context.Request.RawUrl, context.Request.UserHostAddress));
                    WriteJson(context, 401, ApiResponse<object>.Fail(
                        "UNAUTHORIZED",
                        "Valid X-Api-Key or Bearer token is required.",
                        correlationId));
                    return;
                }

                DispatchRoute(context, route, correlationId);
                LogRequest(context, sw, correlationId);
            }
            catch (Exception ex)
            {
                FileLogger.Error(string.Format("Unhandled exception during {0} {1}", method, context.Request.RawUrl), ex);
                WriteJson(context, 500, ApiResponse<object>.Fail(
                    "INTERNAL_SERVER_ERROR",
                    "An unexpected error occurred while processing the WSUS request.",
                    correlationId));
            }
        }

        private static void DispatchRoute(HttpContext context, string route, string correlationId)
        {
            string[] segments = route.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0)
            {
                WriteJson(context, 404, ApiResponse<object>.Fail("NOT_FOUND", "Endpoint not found.", correlationId));
                return;
            }

            string resource = segments[0].ToLowerInvariant();
            string itemId = segments.Length >= 2 ? Uri.UnescapeDataString(segments[1]) : null;

            switch (resource)
            {
                case "summary":
                    if (segments.Length == 1) { HandleSummary(context, correlationId); return; }
                    break;
                case "computers":
                    if (segments.Length == 1) { HandleComputers(context, correlationId); return; }
                    if (segments.Length == 2) { HandleComputerDetail(context, itemId, correlationId); return; }
                    break;
                case "updates":
                    if (segments.Length == 1) { HandleUpdates(context, correlationId); return; }
                    if (segments.Length == 2) { HandleUpdateDetail(context, itemId, correlationId); return; }
                    break;
                case "groups":
                    if (segments.Length == 1) { HandleGroups(context, correlationId); return; }
                    if (segments.Length == 2) { HandleGroupDetail(context, itemId, correlationId); return; }
                    break;
                case "sync":
                    if (segments.Length == 1) { HandleSync(context, correlationId); return; }
                    break;
            }

            WriteJson(context, 404, ApiResponse<object>.Fail("NOT_FOUND", "Endpoint not found.", correlationId));
        }

        private static void HandleHealth(HttpContext context, string correlationId)
        {
            WsusBackgroundRefreshService refresher = WsusBackgroundRefreshService.Instance;
            WsusSettingsConfig settings = ApiConfigProvider.Instance.GetWsusSettings();

            var payload = new
            {
                status = "Healthy",
                readOnly = true,
                serverId = settings.ResolvedServerId,
                serverName = settings.ResolvedServerName,
                startedAtUtc = refresher.StartedAtUtc,
                uptimeSeconds = Math.Round((DateTime.UtcNow - refresher.StartedAtUtc).TotalSeconds, 0),
                cacheDurationMinutes = Cache.CacheDuration.TotalMinutes,
                lastRefreshCycleCompletedUtc = refresher.LastCycleCompletedUtc,
                lastError = Cache.LastError
            };

            WriteJson(context, 200, ApiResponse<object>.Ok(payload, new ApiMeta
            {
                ServerId = settings.ResolvedServerId,
                GeneratedAtUtc = DateTime.UtcNow,
                CorrelationId = correlationId
            }));
        }

        private static void HandleSummary(HttpContext context, string correlationId)
        {
            CachedValue<WsusLocalSnapshot> cached;
            if (!TryGetSnapshot(context, correlationId, out cached)) return;
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            WriteJson(context, 200, ApiResponse<ServerSummaryDto>.Ok(cached.Value.Summary, BuildMeta(serverId, cached, correlationId)));
        }

        private static void HandleComputers(HttpContext context, string correlationId)
        {
            CachedValue<WsusLocalSnapshot> cached;
            if (!TryGetSnapshot(context, correlationId, out cached)) return;
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;

            NameValueCollection q = context.Request.QueryString;
            string search = q["search"];
            string group = q["group"];
            string os = q["os"];
            string status = q["status"];
            int page = ParseInt(q["page"], 1);
            int pageSize = ParseInt(q["pageSize"], 50);

            IEnumerable<ComputerDto> query = cached.Value.Computers;

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim();
                query = query.Where(c =>
                    (c.FullDomainName != null && c.FullDomainName.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (c.IpAddress != null && c.IpAddress.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (c.OsDescription != null && c.OsDescription.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0));
            }
            if (!string.IsNullOrWhiteSpace(group))
            {
                string g = group.Trim();
                query = query.Where(c => c.AssignedTargetGroups.Any(ag => string.Equals(ag, g, StringComparison.OrdinalIgnoreCase)));
            }
            if (!string.IsNullOrWhiteSpace(os))
            {
                string o = os.Trim();
                query = query.Where(c => c.OsDescription != null && c.OsDescription.IndexOf(o, StringComparison.OrdinalIgnoreCase) >= 0);
            }
            if (!string.IsNullOrWhiteSpace(status))
            {
                string st = status.Trim();
                query = query.Where(c => string.Equals(c.ComplianceStatus, st, StringComparison.OrdinalIgnoreCase));
            }

            PagedResult<ComputerDto> paged = Paginate(query.OrderBy(c => c.FullDomainName), page, pageSize);
            WriteJson(context, 200, ApiResponse<IReadOnlyList<ComputerDto>>.Ok(
                paged.Items, BuildMeta(serverId, cached, correlationId, paged.Pagination)));
        }

        private static void HandleComputerDetail(HttpContext context, string computerId, string correlationId)
        {
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            CachedValue<ComputerDetailDto> cached = Cache.GetOrRefreshComputerDetail(computerId, DataService);
            if (cached.Value == null)
            {
                WriteJson(context, 404, ApiResponse<object>.Fail("COMPUTER_NOT_FOUND",
                    string.Format("Computer '{0}' was not found.", computerId), correlationId));
                return;
            }
            WriteJson(context, 200, ApiResponse<ComputerDetailDto>.Ok(cached.Value, BuildMeta(serverId, cached, correlationId)));
        }

        private static void HandleUpdates(HttpContext context, string correlationId)
        {
            CachedValue<WsusLocalSnapshot> cached;
            if (!TryGetSnapshot(context, correlationId, out cached)) return;
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;

            NameValueCollection q = context.Request.QueryString;
            string search = q["search"];
            string classification = q["classification"];
            string severity = q["severity"];
            bool? approved = ParseNullableBool(q["approved"]);
            bool? declined = ParseNullableBool(q["declined"]);
            string kb = q["kb"];
            int page = ParseInt(q["page"], 1);
            int pageSize = ParseInt(q["pageSize"], 50);

            IEnumerable<UpdateDto> query = cached.Value.Updates;

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim();
                query = query.Where(u =>
                    (u.Title != null && u.Title.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0) ||
                    (u.KbArticle != null && u.KbArticle.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0));
            }
            if (!string.IsNullOrWhiteSpace(classification))
            {
                string cls = classification.Trim();
                query = query.Where(u => string.Equals(u.Classification, cls, StringComparison.OrdinalIgnoreCase));
            }
            if (!string.IsNullOrWhiteSpace(severity))
            {
                string sev = severity.Trim();
                query = query.Where(u => string.Equals(u.MsrcSeverity, sev, StringComparison.OrdinalIgnoreCase));
            }
            if (approved.HasValue) query = query.Where(u => u.IsApproved == approved.Value);
            if (declined.HasValue) query = query.Where(u => u.IsDeclined == declined.Value);
            if (!string.IsNullOrWhiteSpace(kb))
            {
                string kbTerm = kb.Trim();
                query = query.Where(u => u.KbArticle != null && u.KbArticle.IndexOf(kbTerm, StringComparison.OrdinalIgnoreCase) >= 0);
            }

            PagedResult<UpdateDto> paged = Paginate(query.OrderByDescending(u => u.ArrivalDateUtc ?? DateTime.MinValue), page, pageSize);
            WriteJson(context, 200, ApiResponse<IReadOnlyList<UpdateDto>>.Ok(
                paged.Items, BuildMeta(serverId, cached, correlationId, paged.Pagination)));
        }

        private static void HandleUpdateDetail(HttpContext context, string updateId, string correlationId)
        {
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            int rev;
            int? revision = int.TryParse(context.Request.QueryString["revision"], out rev) ? rev : (int?)null;
            CachedValue<UpdateDetailDto> cached = Cache.GetOrRefreshUpdateDetail(updateId, revision, DataService);
            if (cached.Value == null)
            {
                WriteJson(context, 404, ApiResponse<object>.Fail("UPDATE_NOT_FOUND",
                    string.Format("Update '{0}' was not found.", updateId), correlationId));
                return;
            }
            WriteJson(context, 200, ApiResponse<UpdateDetailDto>.Ok(cached.Value, BuildMeta(serverId, cached, correlationId)));
        }

        private static void HandleGroups(HttpContext context, string correlationId)
        {
            CachedValue<WsusLocalSnapshot> cached;
            if (!TryGetSnapshot(context, correlationId, out cached)) return;
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            List<GroupDto> groups = cached.Value.Groups.OrderBy(g => g.Name).ToList();
            WriteJson(context, 200, ApiResponse<List<GroupDto>>.Ok(groups, BuildMeta(serverId, cached, correlationId)));
        }

        private static void HandleGroupDetail(HttpContext context, string groupId, string correlationId)
        {
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;
            CachedValue<GroupDetailDto> cached = Cache.GetOrRefreshGroupDetail(groupId, DataService);
            if (cached.Value == null)
            {
                WriteJson(context, 404, ApiResponse<object>.Fail("GROUP_NOT_FOUND",
                    string.Format("Target group '{0}' was not found.", groupId), correlationId));
                return;
            }
            WriteJson(context, 200, ApiResponse<GroupDetailDto>.Ok(cached.Value, BuildMeta(serverId, cached, correlationId)));
        }

        private static void HandleSync(HttpContext context, string correlationId)
        {
            CachedValue<WsusLocalSnapshot> cached;
            if (!TryGetSnapshot(context, correlationId, out cached)) return;
            string serverId = ApiConfigProvider.Instance.GetWsusSettings().ResolvedServerId;

            int limit = ParseInt(context.Request.QueryString["limit"], 20);
            if (limit < 1) limit = 20;
            if (limit > 100) limit = 100;

            SyncOverviewDto source = cached.Value.Sync;
            SyncOverviewDto sliced = new SyncOverviewDto
            {
                ServerId = source.ServerId,
                ServerName = source.ServerName,
                Settings = source.Settings,
                CurrentStatus = source.CurrentStatus,
                History = source.History.Take(limit).ToList()
            };
            WriteJson(context, 200, ApiResponse<SyncOverviewDto>.Ok(sliced, BuildMeta(serverId, cached, correlationId)));
        }

        private static bool TryGetSnapshot(
            HttpContext context,
            string correlationId,
            out CachedValue<WsusLocalSnapshot> cached)
        {
            try
            {
                cached = Cache.GetOrRefreshSnapshot(DataService);
                return true;
            }
            catch (Exception ex)
            {
                Cache.RecordError(ex);
                cached = null;
                WriteJson(context, 502, ApiResponse<object>.Fail(
                    "WSUS_LOCAL_ERROR",
                    string.Format("Unable to query local WSUS service: {0}", ex.Message),
                    correlationId));
                return false;
            }
        }

        private static string ExtractApiRelativeRoute(HttpContext context)
        {
            string appRel = context.Request.AppRelativeCurrentExecutionFilePath ?? "~/";
            string path = appRel.StartsWith("~/", StringComparison.Ordinal) ? appRel.Substring(2) : appRel.TrimStart('/');
            if (path.StartsWith("api/v1/", StringComparison.OrdinalIgnoreCase))
                return path.Substring("api/v1/".Length).Trim('/');
            if (string.Equals(path, "api/v1", StringComparison.OrdinalIgnoreCase))
                return string.Empty;
            return path.Trim('/');
        }

        private static bool IsAuthorized(HttpContext context)
        {
            ApiSecurityConfig sec = ApiConfigProvider.Instance.GetSecurityConfig();
            if (!sec.AuthEnabled)
                return true;

            string rawApiKey = context.Request.Headers["X-Api-Key"];
            string apiKey = rawApiKey != null ? rawApiKey.Trim() : null;
            if (!string.IsNullOrEmpty(apiKey) && (sec.ApiKeys ?? new List<string>()).Any(k => ConstantTimeEquals(k, apiKey)))
                return true;

            string authHeader = context.Request.Headers["Authorization"];
            if (!string.IsNullOrWhiteSpace(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                string token = authHeader.Substring("Bearer ".Length).Trim();
                if (!string.IsNullOrEmpty(token) && (sec.BearerTokens ?? new List<string>()).Any(t => ConstantTimeEquals(t, token)))
                    return true;
            }

            return false;
        }

        private static void ApplyCorsHeaders(HttpContext context)
        {
            ApiSecurityConfig sec = ApiConfigProvider.Instance.GetSecurityConfig();
            List<string> origins = sec.AllowedOrigins ?? new List<string>();
            string requestOrigin = context.Request.Headers["Origin"];

            if (origins.Contains("*"))
            {
                context.Response.Headers["Access-Control-Allow-Origin"] = "*";
            }
            else if (!string.IsNullOrEmpty(requestOrigin) &&
                     origins.Any(o => string.Equals(o, requestOrigin, StringComparison.OrdinalIgnoreCase)))
            {
                context.Response.Headers["Access-Control-Allow-Origin"] = requestOrigin;
                context.Response.Headers["Vary"] = "Origin";
            }

            context.Response.Headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
            context.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, X-Api-Key, Content-Type, X-Correlation-Id";
        }

        private static void WriteJson(HttpContext context, int statusCode, object payload)
        {
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            if (!string.Equals(context.Request.HttpMethod, "HEAD", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.Write(JsonHelper.Serialize(payload));
            }
        }

        private static void LogRequest(HttpContext context, Stopwatch sw, string correlationId)
        {
            sw.Stop();
            FileLogger.Info(string.Format("{0} {1} -> {2} ({3} ms) [IP={4}] [CID={5}]",
                context.Request.HttpMethod,
                context.Request.RawUrl,
                context.Response.StatusCode,
                sw.ElapsedMilliseconds,
                context.Request.UserHostAddress,
                correlationId));
        }

        private static ApiMeta BuildMeta<T>(string serverId, CachedValue<T> cached, string correlationId, PaginationMeta pagination = null)
        {
            return new ApiMeta
            {
                ServerId = serverId,
                GeneratedAtUtc = DateTime.UtcNow,
                CachedAtUtc = cached != null ? (DateTime?)cached.CachedAtUtc : null,
                ExpiresAtUtc = cached != null ? (DateTime?)cached.ExpiresAtUtc : null,
                FromCache = cached != null && cached.FromCache,
                CorrelationId = correlationId,
                Pagination = pagination
            };
        }

        private static PagedResult<T> Paginate<T>(IEnumerable<T> source, int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 50;
            if (pageSize > 500) pageSize = 500;

            IList<T> list = source as IList<T> ?? source.ToList();
            int total = list.Count;
            int totalPages = (int)Math.Ceiling((double)total / pageSize);
            return new PagedResult<T>
            {
                Items = list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                Pagination = new PaginationMeta
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalItems = total,
                    TotalPages = totalPages
                }
            };
        }

        private static int ParseInt(string raw, int fallback)
        {
            int val;
            return int.TryParse(raw, out val) ? val : fallback;
        }

        private static bool? ParseNullableBool(string raw)
        {
            bool val;
            return bool.TryParse(raw, out val) ? val : (bool?)null;
        }

        private static bool ConstantTimeEquals(string a, string b)
        {
            byte[] aBytes = Encoding.UTF8.GetBytes(a ?? string.Empty);
            byte[] bBytes = Encoding.UTF8.GetBytes(b ?? string.Empty);
            int diff = aBytes.Length ^ bBytes.Length;
            int minLen = Math.Min(aBytes.Length, bBytes.Length);
            for (int i = 0; i < minLen; i++) diff |= aBytes[i] ^ bBytes[i];
            return diff == 0;
        }
    }
}
