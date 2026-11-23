using System;

namespace WsusRestApi.Configuration
{
    public class WsusServerConfig
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string HostName { get; set; }
        public int Port { get; set; } = 8530;
        public bool UseSsl { get; set; }
        public bool Enabled { get; set; } = true;
        public string Description { get; set; }
    }
}
