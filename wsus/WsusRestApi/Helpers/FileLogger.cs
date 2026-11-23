using System;
using System.IO;
using System.Web.Hosting;

namespace WsusRestApi.Helpers
{
    public static class FileLogger
    {
        private static readonly object WriteLock = new object();
        private static readonly string LogDir = ResolveLogDir();

        private static string ResolveLogDir()
        {
            string dir = HostingEnvironment.MapPath("~/App_Data/Logs")
                         ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "Logs");
            Directory.CreateDirectory(dir);
            return dir;
        }

        public static void Info(string message)
        {
            Write("INFO", message, null);
        }

        public static void Warn(string message)
        {
            Write("WARN", message, null);
        }

        public static void Error(string message, Exception ex = null)
        {
            Write("ERROR", message, ex);
        }

        private static void Write(string level, string message, Exception ex)
        {
            try
            {
                DateTime now = DateTime.UtcNow;
                string line = string.Format("{0:yyyy-MM-dd HH:mm:ss.fff}Z|{1}|{2}", now, level, message);
                if (ex != null)
                {
                    line += Environment.NewLine + ex.ToString();
                }

                string file = Path.Combine(LogDir, string.Format("wsus-api-{0:yyyy-MM-dd}.log", now));
                lock (WriteLock)
                {
                    File.AppendAllText(file, line + Environment.NewLine);
                    if (level == "ERROR")
                    {
                        string errFile = Path.Combine(LogDir, string.Format("wsus-api-errors-{0:yyyy-MM-dd}.log", now));
                        File.AppendAllText(errFile, line + Environment.NewLine);
                    }
                }
            }
            catch
            {
                // Never crash request pipeline due to file logging failure
            }
        }
    }
}
