using System;
using System.Collections.Generic;

namespace WsusRestApi.Models
{
    public class GlobalSummaryDto
    {
        public GlobalSummaryDto()
        {
            Servers = new List<ServerSummaryDto>();
        }

        public int TotalServers { get; set; }
        public int OnlineServers { get; set; }
        public int TotalComputers { get; set; }
        public int CompliantComputers { get; set; }
        public int ComputersWithErrors { get; set; }
        public int ComputersNeedingUpdates { get; set; }
        public int StaleComputers { get; set; }
        public double OverallCompliancePercent { get; set; }
        public int TotalUpdates { get; set; }
        public int ApprovedUpdates { get; set; }
        public int DeclinedUpdates { get; set; }
        public int NeededUpdatesCount { get; set; }
        public List<ServerSummaryDto> Servers { get; set; }
    }

    public class ServerSummaryDto
    {
        public ServerSummaryDto()
        {
            UpdatesByClassification = new Dictionary<string, int>();
            ComputersByOs = new Dictionary<string, int>();
        }

        public string ServerId { get; set; }
        public string ServerName { get; set; }
        public string HostName { get; set; }
        public bool IsOnline { get; set; }
        public string WsusVersion { get; set; }
        public DateTime? LastRefreshedUtc { get; set; }
        public int TotalComputers { get; set; }
        public int CompliantComputers { get; set; }
        public int ComputersNeedingUpdates { get; set; }
        public int ComputersWithErrors { get; set; }
        public int StaleComputers30Days { get; set; }
        public double CompliancePercent { get; set; }
        public int TotalUpdates { get; set; }
        public int ApprovedUpdates { get; set; }
        public int UnapprovedUpdates { get; set; }
        public int DeclinedUpdates { get; set; }
        public int SecurityUpdatesCount { get; set; }
        public int CriticalUpdatesCount { get; set; }
        public int UpdatesNeedingApproval { get; set; }
        public int TotalGroups { get; set; }
        public DateTime? LastSyncStartTimeUtc { get; set; }
        public DateTime? LastSyncEndTimeUtc { get; set; }
        public string LastSyncResult { get; set; }
        public Dictionary<string, int> UpdatesByClassification { get; set; }
        public Dictionary<string, int> ComputersByOs { get; set; }
    }
}
