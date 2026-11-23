using System;
using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;

namespace WsusRestApi.Helpers
{
    /// <summary>
    /// Built-in .NET 4.8 JSON serializer/deserializer with camelCase keys and UTC ISO-8601 dates.
    /// C# 5 compatible, zero external dependencies.
    /// </summary>
    public static class JsonHelper
    {
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer
        {
            MaxJsonLength = int.MaxValue
        };

        public static T Deserialize<T>(string json)
        {
            return Serializer.Deserialize<T>(json);
        }

        public static string Serialize(object value)
        {
            StringBuilder sb = new StringBuilder(1024);
            WriteValue(value, sb);
            return sb.ToString();
        }

        private static void WriteValue(object value, StringBuilder sb)
        {
            if (value == null)
            {
                sb.Append("null");
                return;
            }

            if (value is string)
            {
                WriteString((string)value, sb);
                return;
            }

            if (value is bool)
            {
                sb.Append((bool)value ? "true" : "false");
                return;
            }

            if (value is DateTime)
            {
                DateTime dt = (DateTime)value;
                DateTime utc = dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
                WriteString(utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture), sb);
                return;
            }

            if (value is Guid)
            {
                WriteString(value.ToString(), sb);
                return;
            }

            if (value is Enum)
            {
                WriteString(value.ToString(), sb);
                return;
            }

            if (value is int || value is long || value is short || value is byte ||
                value is uint || value is ulong || value is ushort || value is sbyte)
            {
                sb.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                return;
            }

            if (value is double)
            {
                double d = (double)value;
                sb.Append(double.IsNaN(d) || double.IsInfinity(d) ? "0" : d.ToString("G", CultureInfo.InvariantCulture));
                return;
            }

            if (value is float)
            {
                float f = (float)value;
                sb.Append(float.IsNaN(f) || float.IsInfinity(f) ? "0" : f.ToString("G", CultureInfo.InvariantCulture));
                return;
            }

            if (value is decimal)
            {
                sb.Append(((decimal)value).ToString(CultureInfo.InvariantCulture));
                return;
            }

            if (value is IDictionary)
            {
                IDictionary dict = (IDictionary)value;
                sb.Append('{');
                bool first = true;
                foreach (DictionaryEntry entry in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(Convert.ToString(entry.Key, CultureInfo.InvariantCulture) ?? string.Empty, sb);
                    sb.Append(':');
                    WriteValue(entry.Value, sb);
                }
                sb.Append('}');
                return;
            }

            if (value is IEnumerable)
            {
                IEnumerable enumerable = (IEnumerable)value;
                sb.Append('[');
                bool first = true;
                foreach (object item in enumerable)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteValue(item, sb);
                }
                sb.Append(']');
                return;
            }

            sb.Append('{');
            PropertyInfo[] props = value.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance);
            bool firstProp = true;
            foreach (PropertyInfo prop in props)
            {
                if (!prop.CanRead || prop.GetIndexParameters().Length > 0)
                    continue;

                if (!firstProp) sb.Append(',');
                firstProp = false;

                WriteString(ToCamelCase(prop.Name), sb);
                sb.Append(':');
                WriteValue(prop.GetValue(value, null), sb);
            }
            sb.Append('}');
        }

        private static string ToCamelCase(string name)
        {
            if (string.IsNullOrEmpty(name) || !char.IsUpper(name[0]))
                return name;
            if (name.Length == 1)
                return char.ToLowerInvariant(name[0]).ToString();
            return char.ToLowerInvariant(name[0]) + name.Substring(1);
        }

        private static void WriteString(string str, StringBuilder sb)
        {
            sb.Append('"');
            foreach (char c in str)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ')
                        {
                            sb.Append("\\u");
                            sb.Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
