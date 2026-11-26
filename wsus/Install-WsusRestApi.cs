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
            public bool EnableWriteOperations;
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
                else if (lower == "--enable-write-operations")
                {
                    opts.EnableWriteOperations = true;
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
            Console.WriteLine("  --enable-write-operations  Grant the AppPool WSUS Administrators membership");
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

            // 2. Verify IIS Microsoft.Web.Administration.dll, WSUS API DLL, and .NET Framework 4.8 csc.exe
            WriteStep("Checking IIS (Microsoft.Web.Administration.dll), WSUS API DLL, and .NET Framework 4.8...");
            string iisMwaDll = Path.Combine(Environment.SystemDirectory, @"inetsrv\Microsoft.Web.Administration.dll");
            if (!File.Exists(iisMwaDll))
            {
                throw new FileNotFoundException("IIS Microsoft.Web.Administration.dll not found at '" + iisMwaDll + "'. Ensure IIS Management Tools are installed.");
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
            WriteOk("Found IIS Microsoft.Web.Administration.dll, WSUS API DLL, and .NET Framework 4.8 runtime.");

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

            Assembly mwa = Assembly.LoadFrom(iisMwaDll);
            Type serverManagerType = mwa.GetType("Microsoft.Web.Administration.ServerManager", true);
            Type pipelineModeType = mwa.GetType("Microsoft.Web.Administration.ManagedPipelineMode", true);
            Type identityTypeEnum = mwa.GetType("Microsoft.Web.Administration.ProcessModelIdentityType", true);

            // 5. Locate target IIS Site
            WriteStep("Locating IIS site '" + opts.SiteName + "' (Port " + opts.Port + ")...");
            string resolvedSiteName;
            using (var sm = (IDisposable)Activator.CreateInstance(serverManagerType))
            {
                dynamic dsm = sm;
                dynamic targetSite = FindIisSite(dsm, opts.SiteName, opts.Port);
                if (targetSite == null)
                {
                    throw new InvalidOperationException("Could not find IIS site '" + opts.SiteName + "' or any site bound to port " + opts.Port + ".");
                }
                resolvedSiteName = (string)targetSite.Name;
                WriteOk("Target IIS site: '" + resolvedSiteName + "'");

                // 6. Collision check against existing WSUS endpoints
                foreach (string reserved in WsusReservedPaths)
                {
                    if (string.Equals(reserved, opts.AppPath, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("AppPath '" + opts.AppPath + "' collides with a built-in WSUS endpoint!");
                    }
                }

                if (RootVirtualDirectoryExists(targetSite, opts.AppPath))
                {
                    throw new InvalidOperationException("Virtual directory '" + opts.AppPath + "' already exists under '" + resolvedSiteName + "'. Choose a different AppPath.");
                }

                // 7. Create isolated 64-bit .NET v4.0 AppPool
                WriteStep("Configuring isolated AppPool '" + opts.AppPoolName + "'...");
                dynamic pool = null;
                foreach (dynamic p in dsm.ApplicationPools)
                {
                    if (string.Equals((string)p.Name, opts.AppPoolName, StringComparison.OrdinalIgnoreCase))
                    {
                        pool = p;
                        break;
                    }
                }
                if (pool == null)
                {
                    pool = dsm.ApplicationPools.Add(opts.AppPoolName);
                }
                pool.ManagedRuntimeVersion = "v4.0";
                pool.ManagedPipelineMode = (dynamic)Enum.Parse(pipelineModeType, "Integrated");
                pool.Enable32BitAppOnWin64 = false;
                pool.ProcessModel.IdentityType = (dynamic)Enum.Parse(identityTypeEnum, "ApplicationPoolIdentity");
                try
                {
                    pool.ProcessModel.IdleTimeout = TimeSpan.Zero;
                    pool.StartMode = 1; // AlwaysRunning
                }
                catch
                {
                    // Older IIS versions may not expose StartMode or IdleTimeout
                }
                dsm.CommitChanges();
                WriteOk("AppPool '" + opts.AppPoolName + "' configured.");
            }

            // 8. Add AppPool identity to local "WSUS Reporters" group
            string appPoolIdentity = @"IIS AppPool\" + opts.AppPoolName;
            WriteStep("Granting read-only WSUS access (" + appPoolIdentity + " -> WSUS Reporters)...");
            bool reportersMembershipVerified = AddToWsusReportersGroup(appPoolIdentity);
            if (opts.EnableWriteOperations)
            {
                WriteStep("Granting WSUS write access (" + appPoolIdentity + " -> WSUS Administrators)...");
                AddToWsusAdministratorsGroup(appPoolIdentity);
            }
            else
            {
                CheckWsusGroupMembership(appPoolIdentity, "WSUS Administrators");
            }
            if (!reportersMembershipVerified)
            {
                WriteWarn("WSUS Reporters membership was not verified. The API will be installed, but local WSUS read access is unverified.");
                WriteWarn("Check that '" + appPoolIdentity + "' is a member of the local WSUS Reporters group.");
            }

            // 9. Grant NTFS permissions on InstallDir & App_Data\Logs
            WriteStep("Setting NTFS permissions...");
            RunProcessChecked("icacls.exe", QuoteArg(opts.InstallDir) + " /grant " + QuoteArg(appPoolIdentity + ":(OI)(CI)RX") + " /T /Q");
            RunProcessChecked("icacls.exe", QuoteArg(logsDir) + " /grant " + QuoteArg(appPoolIdentity + ":(OI)(CI)M") + " /T /Q");
            WriteOk("NTFS permissions applied.");

            // 10. Create or update IIS Application
            WriteStep("Registering IIS Application '" + opts.AppPath + "' under '" + resolvedSiteName + "'...");
            using (var sm = (IDisposable)Activator.CreateInstance(serverManagerType))
            {
                dynamic dsm = sm;
                dynamic targetSite = FindIisSite(dsm, resolvedSiteName, opts.Port);
                if (targetSite == null)
                {
                    throw new InvalidOperationException("IIS site '" + resolvedSiteName + "' disappeared before application registration.");
                }

                dynamic existingApp = null;
                foreach (dynamic app in targetSite.Applications)
                {
                    if (string.Equals((string)app.Path, opts.AppPath, StringComparison.OrdinalIgnoreCase))
                    {
                        existingApp = app;
                        break;
                    }
                }

                if (existingApp != null)
                {
                    existingApp.ApplicationPoolName = opts.AppPoolName;
                    try { existingApp["preloadEnabled"] = true; } catch { }
                    dynamic rootVdir = null;
                    foreach (dynamic v in existingApp.VirtualDirectories)
                    {
                        if (string.Equals((string)v.Path, "/", StringComparison.OrdinalIgnoreCase))
                        {
                            rootVdir = v;
                            break;
                        }
                    }
                    if (rootVdir != null)
                    {
                        rootVdir.PhysicalPath = opts.InstallDir;
                    }
                    else
                    {
                        existingApp.VirtualDirectories.Add("/", opts.InstallDir);
                    }
                    dsm.CommitChanges();
                    WriteOk("Updated existing IIS Application '" + opts.AppPath + "'.");
                }
                else
                {
                    dynamic newApp = targetSite.Applications.Add(opts.AppPath, opts.InstallDir);
                    newApp.ApplicationPoolName = opts.AppPoolName;
                    try { newApp["preloadEnabled"] = true; } catch { }
                    dsm.CommitChanges();
                    WriteOk("Created IIS Application '" + opts.AppPath + "'.");
                }
            }

            // 11. Refresh the worker process and verify actual WSUS data access
            bool appPoolReady = RefreshApplicationPool(mwa, opts.AppPoolName);

            // 12. Verify health endpoint and protected WSUS summary endpoint
            string healthUrl = "http://localhost:" + opts.Port + opts.AppPath + "/api/v1/health";
            WriteStep("Testing health endpoint: " + healthUrl);
            Thread.Sleep(2000);
            TestHealthEndpoint(healthUrl, logsDir, serializer);

            string summaryUrl = "http://localhost:" + opts.Port + opts.AppPath + "/api/v1/summary";
            WriteStep("Testing authenticated WSUS data access: " + summaryUrl);
            TestSummaryEndpoint(summaryUrl, generatedApiKey, logsDir, serializer, appPoolReady);

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

        private static dynamic FindIisSite(dynamic serverManager, string preferredName, int port)
        {
            foreach (dynamic site in serverManager.Sites)
            {
                if (string.Equals((string)site.Name, preferredName, StringComparison.OrdinalIgnoreCase))
                {
                    return site;
                }
            }

            string portToken = ":" + port + ":";
            foreach (dynamic site in serverManager.Sites)
            {
                foreach (dynamic binding in site.Bindings)
                {
                    string bindingInfo = (string)binding.BindingInformation;
                    if (bindingInfo != null && bindingInfo.IndexOf(portToken, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return site;
                    }
                }
            }

            return null;
        }

        private static bool RootVirtualDirectoryExists(dynamic site, string appPath)
        {
            foreach (dynamic app in site.Applications)
            {
                if (string.Equals((string)app.Path, "/", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (dynamic vdir in app.VirtualDirectories)
                    {
                        if (string.Equals((string)vdir.Path, appPath, StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }
                    }
                    break;
                }
            }
            return false;
        }

        private static bool AddToWsusReportersGroup(string appPoolIdentity)
        {
            return AddToWsusLocalGroup(appPoolIdentity, "WSUS Reporters");
        }

        private static void AddToWsusAdministratorsGroup(string appPoolIdentity)
        {
            AddToWsusLocalGroup(appPoolIdentity, "WSUS Administrators");
        }

        private static void CheckWsusGroupMembership(string appPoolIdentity, string groupName)
        {
            try
            {
                CommandResult groupCheck = RunProcess("net.exe", "localgroup " + QuoteArg(groupName));
                if (groupCheck.ExitCode == 0 && ContainsExactLine(groupCheck.StdOut, appPoolIdentity))
                {
                    WriteOk("'" + appPoolIdentity + "' is a member of '" + groupName + "'.");
                }
                else
                {
                    WriteStep("'" + appPoolIdentity + "' is not in '" + groupName + "' (read-only mode; pass --enable-write-operations if write access is needed).");
                }
            }
            catch
            {
                // Non-fatal check
            }
        }

        private static bool AddToWsusLocalGroup(string appPoolIdentity, string groupName)
        {
            try
            {
                CommandResult groupCheck = RunProcess("net.exe", "localgroup " + QuoteArg(groupName));
                if (groupCheck.ExitCode != 0)
                {
                    WriteWarn("Local group '" + groupName + "' not found. Add the AppPool identity to it manually if required.");
                    return false;
                }

                if (ContainsExactLine(groupCheck.StdOut, appPoolIdentity))
                {
                    WriteOk("'" + appPoolIdentity + "' is already a member of '" + groupName + "'.");
                    return true;
                }

                CommandResult addRes = RunProcess("net.exe", "localgroup " + QuoteArg(groupName) + " " + QuoteArg(appPoolIdentity) + " /add");
                if (addRes.ExitCode != 0)
                {
                    string err = string.IsNullOrEmpty(addRes.StdErr) ? addRes.StdOut : addRes.StdErr;
                    WriteWarn("Could not update '" + groupName + "' group automatically: " + err.Trim());
                    return false;
                }

                CommandResult verify = RunProcess("net.exe", "localgroup " + QuoteArg(groupName));
                if (verify.ExitCode != 0 || !ContainsExactLine(verify.StdOut, appPoolIdentity))
                {
                    WriteWarn("'" + appPoolIdentity + "' membership in '" + groupName + "' could not be verified after the update.");
                    return false;
                }

                WriteOk("Added and verified '" + appPoolIdentity + "' in '" + groupName + "'.");
                return true;
            }
            catch (Exception ex)
            {
                WriteWarn("Could not update '" + groupName + "' group automatically: " + ex.Message);
                return false;
            }
        }

        private static bool ContainsExactLine(string output, string expected)
        {
            string[] lines = (output ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines)
            {
                if (string.Equals(line.Trim(), expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static bool RefreshApplicationPool(Assembly mwa, string appPoolName)
        {
            try
            {
                Type serverManagerType = mwa.GetType("Microsoft.Web.Administration.ServerManager", true);
                using (var sm = (IDisposable)Activator.CreateInstance(serverManagerType))
                {
                    dynamic dsm = sm;
                    dynamic pool = null;
                    foreach (dynamic candidate in dsm.ApplicationPools)
                    {
                        if (string.Equals((string)candidate.Name, appPoolName, StringComparison.OrdinalIgnoreCase))
                        {
                            pool = candidate;
                            break;
                        }
                    }

                    if (pool == null)
                    {
                        WriteWarn("Could not find AppPool '" + appPoolName + "' to refresh its worker process.");
                        return false;
                    }

                    string state = Convert.ToString(pool.State);
                    if (string.Equals(state, "Started", StringComparison.OrdinalIgnoreCase))
                    {
                        pool.Recycle();
                        WriteOk("Recycled AppPool '" + appPoolName + "' so it can use the current group memberships.");
                        return true;
                    }

                    if (string.Equals(state, "Stopped", StringComparison.OrdinalIgnoreCase))
                    {
                        WriteStep("AppPool '" + appPoolName + "' is stopped; the WSUS data check will start a fresh worker.");
                        return true;
                    }

                    WriteWarn("AppPool '" + appPoolName + "' is in state '" + state + "'; worker refresh could not be confirmed.");
                    return false;
                }
            }
            catch (Exception ex)
            {
                WriteWarn("Could not refresh AppPool '" + appPoolName + "': " + ex.Message);
                return false;
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

        private static bool TestSummaryEndpoint(
            string summaryUrl,
            string apiKey,
            string logsDir,
            JavaScriptSerializer serializer,
            bool appPoolReady)
        {
            HttpWebResponse response = null;
            string body = "";
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(summaryUrl);
                req.Method = "GET";
                req.Accept = "application/json";
                req.Headers["X-Api-Key"] = apiKey;
                req.Timeout = 15000;
                req.ReadWriteTimeout = 15000;

                try
                {
                    response = (HttpWebResponse)req.GetResponse();
                }
                catch (WebException ex)
                {
                    response = ex.Response as HttpWebResponse;
                    if (response == null)
                    {
                        WriteWarn("Authenticated WSUS data check received no HTTP response (" + ex.Status + "): " + ex.Message);
                        WriteWarn("Check network responsiveness and " + logsDir + " for API details.");
                        return false;
                    }
                }

                using (Stream stream = response.GetResponseStream())
                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    body = reader.ReadToEnd();
                    Dictionary<string, object> envelope = null;
                    try
                    {
                        envelope = serializer.Deserialize<Dictionary<string, object>>(body);
                    }
                    catch (Exception ex)
                    {
                        WriteWarn("Authenticated WSUS data check returned an unreadable response: " + ex.Message);
                    }

                    bool success = envelope != null &&
                        envelope.ContainsKey("success") &&
                        envelope["success"] is bool &&
                        (bool)envelope["success"];

                    if (response.StatusCode == HttpStatusCode.Unauthorized)
                    {
                        WriteWarn("Authenticated WSUS data check was rejected with HTTP " + (int)response.StatusCode + ". Confirm the API key configured in this host matches the portal.");
                        return false;
                    }

                    if (success && response.StatusCode == HttpStatusCode.OK)
                    {
                        if (appPoolReady)
                        {
                            WriteOk("Authenticated WSUS summary query succeeded; local WSUS read access is verified.");
                            return true;
                        }

                        WriteWarn("The WSUS summary query succeeded, but AppPool refresh could not be confirmed; read access is not marked verified.");
                        return false;
                    }

                    object errorValue;
                    Dictionary<string, object> error = envelope != null &&
                        envelope.TryGetValue("error", out errorValue)
                        ? errorValue as Dictionary<string, object>
                        : null;
                    string errorCode = error != null && error.ContainsKey("code")
                        ? Convert.ToString(error["code"])
                        : "";
                    string errorMessage = error != null && error.ContainsKey("message")
                        ? Convert.ToString(error["message"])
                        : "";

                    if (errorMessage.IndexOf("access to the path", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        errorMessage.IndexOf("access is denied", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        WriteWarn("The WSUS API could not read local WSUS data: " + errorMessage);
                        WriteWarn("The request was not rejected by API-key authentication. Verify the AppPool identity's WSUS read permissions.");
                    }
                    else if (string.Equals(errorCode, "WSUS_LOCAL_ERROR", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(errorCode, "WSUS_PERMISSION_DENIED", StringComparison.OrdinalIgnoreCase))
                    {
                        WriteWarn("The WSUS API could not query local WSUS data: " + errorMessage);
                    }
                    else
                    {
                        WriteWarn("Authenticated WSUS data check failed with HTTP " + (int)response.StatusCode + ": " +
                            (string.IsNullOrEmpty(errorMessage) ? "The API response did not confirm WSUS data access." : errorMessage));
                    }
                    return false;
                }
            }
            catch (WebException ex)
            {
                WriteWarn("Authenticated WSUS data check failed (" + ex.Status + "): " + ex.Message);
                WriteWarn("Check " + logsDir + " for API details.");
                return false;
            }
            catch (Exception ex)
            {
                WriteWarn("Authenticated WSUS data check failed: " + ex.Message);
                WriteWarn("Check " + logsDir + " for API details.");
                return false;
            }
            finally
            {
                if (response != null)
                {
                    response.Dispose();
                }
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
