using System;

namespace WsusRestApi.Models
{
    public class ServerStatusDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string HostName { get; set; }
        public int Port { get; set; }
        public bool UseSsl { get; set; }
        public bool Enabled { get; set; }
        public string Description { get; set; }
        public bool IsOnline { get; set; }
        public string Version { get; set; }
        public DateTime? LastRefreshedUtc { get; set; }
        public DateTime? NextRefreshUtc { get; set; }
        public string LastError { get; set; }
    }
}
