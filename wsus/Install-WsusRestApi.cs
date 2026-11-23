using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Xml;

namespace WsusRestApiInstaller
{
    internal static class Program
    {
        private const string DefaultPlaceholderKey = "wsus-readonly-api-key-change-me-2026";
        private static readonly string[] WsusReservedPaths = new[]
        {
            "/ClientWebService", "/SimpleAuthWebService", "/ServerSyncWebService",
            "/ApiRemoting30", "/ReportingWebService", "/DssAuthWebService",
            "/Content", "/Selfupdate", "/Inventory", "/iuident.cab"
        };

        private sealed class Options
        {
            public string SiteName = "WSUS Administration";
            public string AppPath = "/wsus-api";
            public string AppPoolName = "WsusRestApiPool";
            public string InstallDir = @"C:\inetpub\wsus-api";
            public int Port = 8530;
            public bool RegenerateTokens;
            public string SourceDir;
            public bool PauseOnExit;
            public bool ShowHelp;
        }

        private static int Main(string[] args)
        {
            Options opts;
            try
            {
                opts = ParseArgs(args);
            }
            catch (Exception ex)
            {
                WriteError(ex.Message);
                PrintUsage();
                return 1;
            }

            if (opts.ShowHelp)
            {
                PrintUsage();
                return 0;
            }

            try
            {
                if (!IsAdministrator())
                {
                    return RelaunchElevated(args);
                }

                RunInstall(opts);
                return 0;
            }
            catch (Exception ex)
            {
                WriteError("Installation failed: " + ex.Message);
                return 1;
            }
            finally
            {
                if (opts.PauseOnExit)
                {
                    Console.WriteLine();
                    Console.Write("Press any key to close...");
                    try
                    {
                        Console.ReadKey(true);
                    }
                    catch
                    {
                        Console.ReadLine();
                    }
                }
            }
        }

        private static Options ParseArgs(string[] args)
        {
            var opts = new Options();
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                string lower = arg.ToLowerInvariant();

                if (lower == "-h" || lower == "--help" || lower == "/?" || lower == "-help")
                {
                    opts.ShowHelp = true;
                }
                else if (lower == "-regeneratetokens" || lower == "--regenerate-tokens")
                {
                    opts.RegenerateTokens = true;
                }
                else if (lower == "--pause-on-exit")
                {
                    opts.PauseOnExit = true;
                }
                else if (lower == "-sitename" || lower == "--site-name")
                {
                    opts.SiteName = RequireValue(args, ref i, arg);
                }
                else if (lower == "-apppath" || lower == "--app-path")
                {
                    opts.AppPath = RequireValue(args, ref i, arg);
                }
                else if (lower == "-apppoolname" || lower == "--app-pool")
                {
                    opts.AppPoolName = RequireValue(args, ref i, arg);
                }
                else if (lower == "-installdir" || lower == "--install-dir")
                {
                    opts.InstallDir = RequireValue(args, ref i, arg);
                }
                else if (lower == "-port" || lower == "--port")
                {
                    string val = RequireValue(args, ref i, arg);
                    int port;
                    if (!int.TryParse(val, out port) || port < 1 || port > 65535)
                    {
                        throw new ArgumentException("Invalid port: " + val);
                    }
                    opts.Port = port;
                }
                else if (lower == "--source" || lower == "-source")
                {
                    opts.SourceDir = RequireValue(args, ref i, arg);
                }
                else
                {
                    throw new ArgumentException("Unknown argument: " + arg);
                }
            }

            if (!opts.AppPath.StartsWith("/"))
            {
                opts.AppPath = "/" + opts.AppPath;
            }

            if (string.IsNullOrEmpty(opts.SourceDir))
            {
                string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? Environment.CurrentDirectory;
                string candidate = Path.Combine(exeDir, "WsusRestApi");
                if (Directory.Exists(candidate))
                {
                    opts.SourceDir = candidate;
                }
                else
                {
                    opts.SourceDir = Path.Combine(Environment.CurrentDirectory, "WsusRestApi");
                }
            }

            return opts;
        }

        private static string RequireValue(string[] args, ref int index, string flag)
        {
            if (index + 1 >= args.Length)
            {
                throw new ArgumentException("Missing value for argument: " + flag);
            }
            return args[++index];
        }

        private static void PrintUsage()
        {
            Console.WriteLine("Usage: Install-WsusRestApi.bat [options]");
            Console.WriteLine("  --site-name <name>       IIS site name (default: \"WSUS Administration\")");
            Console.WriteLine("  --app-path <path>        IIS application path (default: /wsus-api)");
            Console.WriteLine("  --app-pool <name>        IIS AppPool name (default: WsusRestApiPool)");
            Console.WriteLine("  --install-dir <dir>      Target install directory (default: C:\\inetpub\\wsus-api)");
            Console.WriteLine("  --port <port>            IIS site port (default: 8530)");
            Console.WriteLine("  --regenerate-tokens      Rotate X-Api-Key and Bearer Token in security.json");
            Console.WriteLine("  --help                   Show this help message");
        }

        private static bool IsAdministrator()
        {
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        private static int RelaunchElevated(string[] args)
        {
            WriteStep("Requesting Administrator privileges...");
            var quotedArgs = new List<string>();
            bool hasPause = false;
            foreach (string a in args)
            {
                if (string.Equals(a, "--pause-on-exit", StringComparison.OrdinalIgnoreCase))
                {
                    hasPause = true;
                }
                quotedArgs.Add(QuoteArg(a));
            }
            if (!hasPause)
            {
                quotedArgs.Add("--pause-on-exit");
            }

            var psi = new ProcessStartInfo
            {
                FileName = Assembly.GetExecutingAssembly().Location,
                Arguments = string.Join(" ", quotedArgs.ToArray()),
                UseShellExecute = true,
                Verb = "runas"
            };

            using (Process proc = Process.Start(psi))
            {
                if (proc == null)
                {
                    throw new InvalidOperationException("Failed to start elevated installer process.");
                }
                proc.WaitForExit();
                return proc.ExitCode;
            }
        }

        private static void RunInstall(Options opts)
        {
            // 1. Verify source directory
            if (!Directory.Exists(opts.SourceDir))
            {
                throw new DirectoryNotFoundException("Application folder not found: " + opts.SourceDir);
            }

            // 2. Verify IIS appcmd.exe, WSUS API DLL, and .NET Framework 4.8 csc.exe
            WriteStep("Checking IIS (appcmd.exe), WSUS API DLL, and .NET Framework 4.8...");
            string appCmdExe = Path.Combine(Environment.SystemDirectory, @"inetsrv\appcmd.exe");
            if (!File.Exists(appCmdExe))
            {
                throw new FileNotFoundException("IIS appcmd.exe not found at '" + appCmdExe + "'. Ensure IIS Management Tools are installed.");
            }

            string wsusApiDll = @"C:\Program Files\Update Services\Api\Microsoft.UpdateServices.Administration.dll";
            if (!File.Exists(wsusApiDll))
            {
                throw new FileNotFoundException("WSUS API DLL not found at '" + wsusApiDll + "'. Run this installer on a WSUS Server.");
            }

            string dotNetDir = @"C:\Windows\Microsoft.NET\Framework64\v4.0.30319";
            string cscExe = Path.Combine(dotNetDir, "csc.exe");
            if (!File.Exists(cscExe))
            {
                throw new FileNotFoundException(".NET Framework 4.8 compiler not found at '" + cscExe + "'.");
            }
            WriteOk("Found IIS appcmd.exe, WSUS API DLL, and .NET Framework 4.8 runtime.");

            // 3. Deploy runtime config & Global.asax to InstallDir
            WriteStep("Deploying runtime files to " + opts.InstallDir + "...");
            string binDir = Path.Combine(opts.InstallDir, "bin");
            string logsDir = Path.Combine(opts.InstallDir, @"App_Data\Logs");
            Directory.CreateDirectory(binDir);
            Directory.CreateDirectory(logsDir);

            string targetConfigDir = Path.Combine(opts.InstallDir, "Config");
            string targetSecurityFile = Path.Combine(targetConfigDir, "security.json");
            var serializer = new JavaScriptSerializer();

            Dictionary<string, object> existingSecurity = null;
            if (File.Exists(targetSecurityFile) && !opts.RegenerateTokens)
            {
                try
                {
                    string existingRaw = File.ReadAllText(targetSecurityFile, Encoding.UTF8);
                    existingSecurity = serializer.Deserialize<Dictionary<string, object>>(existingRaw);
                }
                catch
                {
                    existingSecurity = null;
                }
            }

            File.Copy(Path.Combine(opts.SourceDir, "Global.asax"), Path.Combine(opts.InstallDir, "Global.asax"), true);
            File.Copy(Path.Combine(opts.SourceDir, "Web.config"), Path.Combine(opts.InstallDir, "Web.config"), true);
            CopyDirectory(Path.Combine(opts.SourceDir, "Config"), targetConfigDir);

            string[] existingApiKeys = GetStringArray(existingSecurity, "apiKeys");
            bool shouldGenerateTokens = opts.RegenerateTokens ||
                existingSecurity == null ||
                existingApiKeys.Length == 0 ||
                existingApiKeys.Contains(DefaultPlaceholderKey, StringComparer.Ordinal);

            string generatedApiKey;
            string generatedBearer;
            var utf8NoBom = new UTF8Encoding(false);

            if (shouldGenerateTokens)
            {
                WriteStep("Generating random API Key and Bearer Token...");
                string templateRaw = File.ReadAllText(targetSecurityFile, Encoding.UTF8);
                var secObj = serializer.Deserialize<Dictionary<string, object>>(templateRaw) ?? new Dictionary<string, object>();
                generatedApiKey = NewRandomToken();
                generatedBearer = NewRandomToken();
                secObj["apiKeys"] = new[] { generatedApiKey };
                secObj["bearerTokens"] = new[] { generatedBearer };
                File.WriteAllText(targetSecurityFile, FormatJson(serializer.Serialize(secObj)), utf8NoBom);
                WriteOk("Generated random tokens in " + targetSecurityFile + ".");
            }
            else
            {
                File.WriteAllText(targetSecurityFile, FormatJson(serializer.Serialize(existingSecurity)), utf8NoBom);
                generatedApiKey = existingApiKeys[0];
                string[] existingBearers = GetStringArray(existingSecurity, "bearerTokens");
                generatedBearer = existingBearers.Length > 0 ? existingBearers[0] : "";
                WriteOk("Preserved existing custom tokens in " + targetSecurityFile + " (use --regenerate-tokens to rotate).");
            }

            // 4. Compile WsusRestApi.dll directly using built-in .NET 4.8 csc.exe
            WriteStep("Compiling WsusRestApi.dll using built-in .NET Framework 4.8...");
            string[] csFiles = Directory.GetFiles(opts.SourceDir, "*.cs", SearchOption.AllDirectories);
            if (csFiles.Length == 0)
            {
                throw new InvalidOperationException("No C# source files found under " + opts.SourceDir);
            }

            string outDll = Path.Combine(binDir, "WsusRestApi.dll");
            var cscArgs = new List<string>
            {
                "/nologo",
                "/target:library",
                "/optimize+",
                QuoteArg("/out:" + outDll),
                QuoteArg("/r:" + Path.Combine(dotNetDir, "System.dll")),
                QuoteArg("/r:" + Path.Combine(dotNetDir, "System.Core.dll")),
                QuoteArg("/r:" + Path.Combine(dotNetDir, "System.Configuration.dll")),
                QuoteArg("/r:" + Path.Combine(dotNetDir, "System.Runtime.Caching.dll")),
                QuoteArg("/r:" + Path.Combine(dotNetDir, "System.Web.dll")),
                QuoteArg("/r:" + Path.Combine(dotNetDir, "System.Web.Extensions.dll")),
                QuoteArg("/r:" + wsusApiDll)
            };
            foreach (string cs in csFiles)
            {
                cscArgs.Add(QuoteArg(cs));
            }

            CommandResult cscRes = RunProcess(cscExe, string.Join(" ", cscArgs.ToArray()));
            if (cscRes.ExitCode != 0)
            {
                if (!string.IsNullOrEmpty(cscRes.StdOut)) Console.Error.WriteLine(cscRes.StdOut);
                if (!string.IsNullOrEmpty(cscRes.StdErr)) Console.Error.WriteLine(cscRes.StdErr);
                throw new InvalidOperationException("Compilation failed with exit code " + cscRes.ExitCode + ".");
            }
            WriteOk("Compiled " + outDll + ".");

            // 5. Locate target IIS Site
            WriteStep("Locating IIS site '" + opts.SiteName + "' (Port " + opts.Port + ")...");
            string resolvedSiteName = ResolveSiteName(appCmdExe, opts.SiteName, opts.Port);
            WriteOk("Target IIS site: '" + resolvedSiteName + "'");

            // 6. Collision check against existing WSUS endpoints
            foreach (string reserved in WsusReservedPaths)
            {
                if (string.Equals(reserved, opts.AppPath, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("AppPath '" + opts.AppPath + "' collides with a built-in WSUS endpoint!");
                }
            }

            if (VirtualDirectoryExists(appCmdExe, resolvedSiteName, opts.AppPath))
            {
                throw new InvalidOperationException("Virtual directory '" + opts.AppPath + "' already exists under '" + resolvedSiteName + "'. Choose a different AppPath.");
            }

            // 7. Create isolated 64-bit .NET v4.0 AppPool
            WriteStep("Configuring isolated AppPool '" + opts.AppPoolName + "'...");
            CommandResult poolCheck = RunProcess(appCmdExe, "list apppool " + QuoteArg(opts.AppPoolName));
            if (poolCheck.ExitCode != 0 || string.IsNullOrEmpty(poolCheck.StdOut.Trim()))
            {
                RunProcessChecked(appCmdExe, "add apppool /name:" + QuoteArg(opts.AppPoolName));
            }
            RunProcessChecked(
                appCmdExe,
                "set apppool " + QuoteArg(opts.AppPoolName) +
                " /managedRuntimeVersion:v4.0" +
                " /managedPipelineMode:Integrated" +
                " /enable32BitAppOnWin64:false" +
                " /processModel.identityType:ApplicationPoolIdentity"
            );
            WriteOk("AppPool '" + opts.AppPoolName + "' configured.");

            // 8. Add AppPool identity to local "WSUS Reporters" group
            string appPoolIdentity = @"IIS AppPool\" + opts.AppPoolName;
            WriteStep("Granting read-only WSUS access (" + appPoolIdentity + " -> WSUS Reporters)...");
            AddToWsusReportersGroup(appPoolIdentity, opts.AppPoolName);

            // 9. Grant NTFS permissions on InstallDir & App_Data\Logs
            WriteStep("Setting NTFS permissions...");
            RunProcessChecked("icacls.exe", QuoteArg(opts.InstallDir) + " /grant " + QuoteArg(appPoolIdentity + ":(OI)(CI)RX") + " /T /Q");
            RunProcessChecked("icacls.exe", QuoteArg(logsDir) + " /grant " + QuoteArg(appPoolIdentity + ":(OI)(CI)M") + " /T /Q");
            WriteOk("NTFS permissions applied.");

            // 10. Create or update IIS Application
            WriteStep("Registering IIS Application '" + opts.AppPath + "' under '" + resolvedSiteName + "'...");
            string appFullName = resolvedSiteName + opts.AppPath;
            CommandResult appCheck = RunProcess(appCmdExe, "list app " + QuoteArg(appFullName));
            if (appCheck.ExitCode == 0 && !string.IsNullOrEmpty(appCheck.StdOut.Trim()))
            {
                RunProcessChecked(appCmdExe, "set app " + QuoteArg(appFullName) + " /applicationPool:" + QuoteArg(opts.AppPoolName));
                RunProcessChecked(appCmdExe, "set vdir " + QuoteArg(appFullName + "/") + " /physicalPath:" + QuoteArg(opts.InstallDir));
                WriteOk("Updated existing IIS Application '" + opts.AppPath + "'.");
            }
            else
            {
                RunProcessChecked(
                    appCmdExe,
                    "add app /site.name:" + QuoteArg(resolvedSiteName) +
                    " /path:" + QuoteArg(opts.AppPath) +
                    " /physicalPath:" + QuoteArg(opts.InstallDir)
                );
                RunProcessChecked(appCmdExe, "set app " + QuoteArg(appFullName) + " /applicationPool:" + QuoteArg(opts.AppPoolName));
                WriteOk("Created IIS Application '" + opts.AppPath + "'.");
            }

            // 11. Verify health endpoint
            string healthUrl = "http://localhost:" + opts.Port + opts.AppPath + "/api/v1/health";
            WriteStep("Testing health endpoint: " + healthUrl);
            Thread.Sleep(2000);
            TestHealthEndpoint(healthUrl, logsDir, serializer);

            Console.WriteLine();
            WriteColorLine(ConsoleColor.Green, "============================================================");
            WriteColorLine(ConsoleColor.White, " WSUS REST API Base URL : http://" + Environment.MachineName + ":" + opts.Port + opts.AppPath + "/api/v1");
            WriteColorLine(ConsoleColor.White, " Health Endpoint        : " + healthUrl);
            WriteColorLine(ConsoleColor.White, " API Security Config    : " + Path.Combine(opts.InstallDir, @"Config\security.json"));
            WriteColorLine(ConsoleColor.White, " WSUS Settings Config   : " + Path.Combine(opts.InstallDir, @"Config\Wsus\wsus-settings.json"));
            WriteColorLine(ConsoleColor.Yellow, " X-Api-Key              : " + generatedApiKey);
            if (!string.IsNullOrEmpty(generatedBearer))
            {
                WriteColorLine(ConsoleColor.Yellow, " Bearer Token           : " + generatedBearer);
            }
            WriteColorLine(ConsoleColor.Green, "============================================================");
        }

        private static string ResolveSiteName(string appCmdExe, string preferredName, int port)
        {
            CommandResult byName = RunProcess(appCmdExe, "list site " + QuoteArg(preferredName));
            if (byName.ExitCode == 0 && !string.IsNullOrEmpty(byName.StdOut.Trim()))
            {
                return preferredName;
            }

            CommandResult allSites = RunProcessChecked(appCmdExe, "list site /xml");
            var doc = new XmlDocument();
            doc.LoadXml(allSites.StdOut);
            XmlNodeList nodes = doc.SelectNodes("//SITE");
            string portToken = ":" + port + ":";
            if (nodes != null)
            {
                foreach (XmlNode node in nodes)
                {
                    if (node.Attributes == null) continue;
                    XmlAttribute bindingsAttr = node.Attributes["bindings"];
                    XmlAttribute nameAttr = node.Attributes["SITE.NAME"];
                    if (bindingsAttr != null && nameAttr != null && bindingsAttr.Value.IndexOf(portToken, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return nameAttr.Value;
                    }
                }
            }

            throw new InvalidOperationException("Could not find IIS site '" + preferredName + "' or any site bound to port " + port + ".");
        }

        private static bool VirtualDirectoryExists(string appCmdExe, string siteName, string appPath)
        {
            CommandResult vdirs = RunProcess(appCmdExe, "list vdir /app.name:" + QuoteArg(siteName + "/") + " /xml");
            if (vdirs.ExitCode != 0 || string.IsNullOrEmpty(vdirs.StdOut.Trim()))
            {
                return false;
            }

            var doc = new XmlDocument();
            doc.LoadXml(vdirs.StdOut);
            XmlNodeList nodes = doc.SelectNodes("//VDIR");
            if (nodes == null) return false;

            foreach (XmlNode node in nodes)
            {
                if (node.Attributes == null) continue;
                XmlAttribute pathAttr = node.Attributes["path"];
                if (pathAttr != null && string.Equals(pathAttr.Value, appPath, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static void AddToWsusReportersGroup(string appPoolIdentity, string appPoolName)
        {
            try
            {
                CommandResult groupCheck = RunProcess("net.exe", "localgroup \"WSUS Reporters\"");
                if (groupCheck.ExitCode != 0)
                {
                    WriteWarn("Local group 'WSUS Reporters' not found. Ensure the AppPool identity has read access to WSUS.");
                    return;
                }

                if (groupCheck.StdOut.IndexOf(appPoolName, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    WriteOk("'" + appPoolIdentity + "' is already a member of 'WSUS Reporters'.");
                    return;
                }

                CommandResult addRes = RunProcess("net.exe", "localgroup \"WSUS Reporters\" " + QuoteArg(appPoolIdentity) + " /add");
                if (addRes.ExitCode == 0)
                {
                    WriteOk("Added '" + appPoolIdentity + "' to 'WSUS Reporters'.");
                }
                else
                {
                    string err = string.IsNullOrEmpty(addRes.StdErr) ? addRes.StdOut : addRes.StdErr;
                    WriteWarn("Could not update 'WSUS Reporters' group automatically: " + err.Trim());
                }
            }
            catch (Exception ex)
            {
                WriteWarn("Could not update 'WSUS Reporters' group automatically: " + ex.Message);
            }
        }

        private static void TestHealthEndpoint(string healthUrl, string logsDir, JavaScriptSerializer serializer)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(healthUrl);
                req.Method = "GET";
                req.Timeout = 15000;
                req.ReadWriteTimeout = 15000;

                using (var resp = (HttpWebResponse)req.GetResponse())
                using (Stream stream = resp.GetResponseStream())
                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    var json = serializer.Deserialize<Dictionary<string, object>>(body);
                    bool success = json != null && json.ContainsKey("success") && json["success"] is bool && (bool)json["success"];
                    if (success)
                    {
                        var data = json.ContainsKey("data") ? json["data"] as Dictionary<string, object> : null;
                        object status = data != null && data.ContainsKey("status") ? data["status"] : "unknown";
                        object readOnly = data != null && data.ContainsKey("readOnly") ? data["readOnly"] : "unknown";
                        WriteOk("Health check passed! Status: " + status + ", ReadOnly: " + readOnly);
                    }
                    else
                    {
                        WriteWarn("Health endpoint responded with success=false.");
                    }
                }
            }
            catch (Exception ex)
            {
                WriteWarn("Health check request failed: " + ex.Message);
                WriteWarn("Check Event Viewer or " + logsDir + " for details.");
            }
        }

        private static string NewRandomToken()
        {
            var bytes = new byte[24];
            using (var rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(bytes);
            }
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (byte b in bytes)
            {
                sb.Append(b.ToString("x2"));
            }
            return sb.ToString();
        }

        private static string[] GetStringArray(Dictionary<string, object> dict, string key)
        {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null)
            {
                return new string[0];
            }
            var arr = dict[key] as System.Collections.IEnumerable;
            if (arr == null || dict[key] is string)
            {
                return new string[0];
            }
            var list = new List<string>();
            foreach (object item in arr)
            {
                if (item != null)
                {
                    list.Add(item.ToString());
                }
            }
            return list.ToArray();
        }

        private static void CopyDirectory(string sourceDir, string targetDir)
        {
            Directory.CreateDirectory(targetDir);
            foreach (string file in Directory.GetFiles(sourceDir))
            {
                string destFile = Path.Combine(targetDir, Path.GetFileName(file));
                File.Copy(file, destFile, true);
            }
            foreach (string subDir in Directory.GetDirectories(sourceDir))
            {
                string destSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
                CopyDirectory(subDir, destSubDir);
            }
        }

        private static string FormatJson(string json)
        {
            var sb = new StringBuilder();
            int indent = 0;
            bool inQuotes = false;
            bool escaped = false;

            foreach (char ch in json)
            {
                if (escaped)
                {
                    sb.Append(ch);
                    escaped = false;
                    continue;
                }
                if (ch == '\\' && inQuotes)
                {
                    sb.Append(ch);
                    escaped = true;
                    continue;
                }
                if (ch == '"')
                {
                    sb.Append(ch);
                    inQuotes = !inQuotes;
                    continue;
                }
                if (inQuotes)
                {
                    sb.Append(ch);
                    continue;
                }

                switch (ch)
                {
                    case '{':
                    case '[':
                        sb.Append(ch);
                        sb.AppendLine();
                        indent++;
                        sb.Append(new string(' ', indent * 2));
                        break;
                    case '}':
                    case ']':
                        sb.AppendLine();
                        indent = Math.Max(0, indent - 1);
                        sb.Append(new string(' ', indent * 2));
                        sb.Append(ch);
                        break;
                    case ',':
                        sb.Append(ch);
                        sb.AppendLine();
                        sb.Append(new string(' ', indent * 2));
                        break;
                    case ':':
                        sb.Append(": ");
                        break;
                    default:
                        if (!char.IsWhiteSpace(ch))
                        {
                            sb.Append(ch);
                        }
                        break;
                }
            }
            return sb.ToString();
        }

        private sealed class CommandResult
        {
            public int ExitCode;
            public string StdOut;
            public string StdErr;
        }

        private static CommandResult RunProcessChecked(string fileName, string arguments)
        {
            CommandResult res = RunProcess(fileName, arguments);
            if (res.ExitCode != 0)
            {
                string msg = !string.IsNullOrEmpty(res.StdErr) ? res.StdErr : res.StdOut;
                throw new InvalidOperationException(fileName + " exited with code " + res.ExitCode + ": " + msg.Trim());
            }
            return res;
        }

        private static CommandResult RunProcess(string fileName, string arguments)
        {
            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using (Process proc = Process.Start(psi))
            {
                if (proc == null)
                {
                    throw new InvalidOperationException("Failed to start " + fileName);
                }
                string stdOut = proc.StandardOutput.ReadToEnd();
                string stdErr = proc.StandardError.ReadToEnd();
                proc.WaitForExit();
                return new CommandResult
                {
                    ExitCode = proc.ExitCode,
                    StdOut = stdOut ?? "",
                    StdErr = stdErr ?? ""
                };
            }
        }

        private static string QuoteArg(string arg)
        {
            if (string.IsNullOrEmpty(arg)) return "\"\"";
            if (arg.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return arg;
            return "\"" + arg.Replace("\"", "\\\"") + "\"";
        }

        private static void WriteStep(string msg)
        {
            WriteColorLine(ConsoleColor.Cyan, "[*] " + msg);
        }

        private static void WriteOk(string msg)
        {
            WriteColorLine(ConsoleColor.Green, "[OK] " + msg);
        }

        private static void WriteWarn(string msg)
        {
            WriteColorLine(ConsoleColor.Yellow, "[WARN] " + msg);
        }

        private static void WriteError(string msg)
        {
            WriteColorLine(ConsoleColor.Red, "[ERROR] " + msg);
        }

        private static void WriteColorLine(ConsoleColor color, string msg)
        {
            ConsoleColor prev = Console.ForegroundColor;
            try
            {
                Console.ForegroundColor = color;
                Console.WriteLine(msg);
            }
            finally
            {
                Console.ForegroundColor = prev;
            }
        }
    }
}
