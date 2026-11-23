using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Principal;
using System.Text;
using System.Web.Http;
using System.Web.Http.Controllers;
using System.Web.Http.Filters;
using NLog;
using WsusRestApi.Configuration;
using WsusRestApi.Models;

namespace WsusRestApi.Filters
{
    /// <summary>
    /// Validates X-Api-Key or Authorization: Bearer tokens against Config\NextJs\nextjs-client.json.
    /// Grants a ReadOnly principal on success.
    /// </summary>
    public sealed class WsusAuthFilter : AuthorizationFilterAttribute
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();

        public override void OnAuthorization(HttpActionContext actionContext)
        {
            if (SkipAuthorization(actionContext))
                return;

            var nextJsConfig = ApiConfigProvider.Instance.GetNextJsConfig();
            if (!nextJsConfig.AuthEnabled)
            {
                SetReadOnlyPrincipal(actionContext, "anonymous-dev");
                return;
            }

            var apiKeys = nextJsConfig.ApiKeys ?? new List<string>();
            var bearerTokens = nextJsConfig.BearerTokens ?? new List<string>();

            // 1. Check X-Api-Key header
            if (actionContext.Request.Headers.TryGetValues("X-Api-Key", out var apiKeyValues))
            {
                string providedKey = apiKeyValues.FirstOrDefault()?.Trim();
                if (!string.IsNullOrEmpty(providedKey) && apiKeys.Any(k => ConstantTimeEquals(k, providedKey)))
                {
                    SetReadOnlyPrincipal(actionContext, "api-key-client");
                    return;
                }
            }

            // 2. Check Authorization: Bearer <token>
            var authHeader = actionContext.Request.Headers.Authorization;
            if (authHeader != null &&
                string.Equals(authHeader.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(authHeader.Parameter))
            {
                string token = authHeader.Parameter.Trim();
                if (bearerTokens.Any(t => ConstantTimeEquals(t, token)))
                {
                    SetReadOnlyPrincipal(actionContext, "bearer-client");
                    return;
                }
            }

            Logger.Warn("Unauthorized request to {0} {1}",
                actionContext.Request.Method, actionContext.Request.RequestUri?.AbsolutePath);

            string correlationId = actionContext.Request.Properties.TryGetValue("CorrelationId", out var cid)
                ? cid?.ToString()
                : null;

            actionContext.Response = actionContext.Request.CreateResponse(
                HttpStatusCode.Unauthorized,
                ApiResponse<object>.Fail("UNAUTHORIZED", "Valid X-Api-Key or Bearer token is required.", correlationId));
        }

        private static bool SkipAuthorization(HttpActionContext actionContext)
        {
            return actionContext.ActionDescriptor.GetCustomAttributes<AllowAnonymousAttribute>().Any() ||
                   actionContext.ControllerContext.ControllerDescriptor.GetCustomAttributes<AllowAnonymousAttribute>().Any();
        }

        private static void SetReadOnlyPrincipal(HttpActionContext actionContext, string identityName)
        {
            var identity = new GenericIdentity(identityName, "WsusReadOnlyAuth");
            actionContext.RequestContext.Principal = new GenericPrincipal(identity, new[] { "ReadOnly" });
        }

        private static bool ConstantTimeEquals(string a, string b)
        {
            byte[] aBytes = Encoding.UTF8.GetBytes(a ?? string.Empty);
            byte[] bBytes = Encoding.UTF8.GetBytes(b ?? string.Empty);

            int diff = aBytes.Length ^ bBytes.Length;
            int minLength = Math.Min(aBytes.Length, bBytes.Length);
            for (int i = 0; i < minLength; i++)
            {
                diff |= aBytes[i] ^ bBytes[i];
            }
            return diff == 0;
        }
    }
}
