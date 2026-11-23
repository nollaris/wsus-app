using System.Linq;
using System.Net.Http.Formatting;
using System.Web.Http;
using System.Web.Http.Cors;
using System.Web.Http.ExceptionHandling;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;
using WsusRestApi.Configuration;
using WsusRestApi.Filters;
using WsusRestApi.Handlers;

namespace WsusRestApi
{
    public static class WebApiConfig
    {
        public static void Register(HttpConfiguration config)
        {
            // 1. CORS for Next.js frontend (loaded from Config\NextJs\nextjs-client.json)
            var nextJsConfig = ApiConfigProvider.Instance.GetNextJsConfig();
            string origins = nextJsConfig.AllowedOrigins != null && nextJsConfig.AllowedOrigins.Any()
                ? string.Join(",", nextJsConfig.AllowedOrigins)
                : "http://localhost:3000";
            var corsAttr = new EnableCorsAttribute(
                origins: origins,
                headers: "Authorization,X-Api-Key,Content-Type,X-Correlation-Id",
                methods: "GET,HEAD,OPTIONS");
            config.EnableCors(corsAttr);

            // 2. Attribute routing
            config.MapHttpAttributeRoutes();

            // 3. CamelCase JSON serialization with UTC ISO-8601 dates
            config.Formatters.Clear();
            var jsonFormatter = new JsonMediaTypeFormatter
            {
                SerializerSettings = new JsonSerializerSettings
                {
                    ContractResolver = new CamelCasePropertyNamesContractResolver(),
                    DateTimeZoneHandling = DateTimeZoneHandling.Utc,
                    NullValueHandling = NullValueHandling.Include,
                    Formatting = Formatting.None
                }
            };
            jsonFormatter.SerializerSettings.Converters.Add(new IsoDateTimeConverter());
            config.Formatters.Add(jsonFormatter);

            // 4. Request logging, auth, read-only guard, and global exception handling
            config.MessageHandlers.Add(new RequestLoggingHandler());
            config.Filters.Add(new ReadOnlyGuardFilter());
            config.Filters.Add(new WsusAuthFilter());

            config.Services.Add(typeof(IExceptionLogger), new GlobalExceptionLogger());
            config.Services.Replace(typeof(IExceptionHandler), new GlobalExceptionHandler());
        }
    }
}
