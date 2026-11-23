using System;
using System.Collections.Generic;

namespace WsusRestApi.Models
{
    public class ComputerDto
    {
        public string ComputerId { get; set; }
        public string ServerId { get; set; }
        public string FullDomainName { get; set; }
        public string IpAddress { get; set; }
        public string OsDescription { get; set; }
        public string OsVersion { get; set; }
        public string ClientVersion { get; set; }
        public string ComputerRole { get; set; }
        public string RequestedTargetGroup { get; set; }
        public List<string> AssignedTargetGroups { get; set; } = new List<string>();
        public DateTime? LastSyncTimeUtc { get; set; }
        public DateTime? LastReportedStatusTimeUtc { get; set; }
        public DateTime? LastReportedRebootTimeUtc { get; set; }

        // Aggregated update status counts for this computer
        public int InstalledCount { get; set; }
        public int NeededCount { get; set; }
        public int FailedCount { get; set; }
        public int PendingRebootCount { get; set; }
        public int NotApplicableCount { get; set; }
        public int UnknownCount { get; set; }
        public string ComplianceStatus { get; set; } // Compliant | Needed | Error | Stale
    }

    public class ComputerDetailDto
    {
        public ComputerDto Computer { get; set; }
        public List<ComputerUpdateStatusDto> NeededUpdates { get; set; } = new List<ComputerUpdateStatusDto>();
        public List<ComputerUpdateStatusDto> FailedUpdates { get; set; } = new List<ComputerUpdateStatusDto>();
        public List<ComputerUpdateStatusDto> PendingRebootUpdates { get; set; } = new List<ComputerUpdateStatusDto>();
        public List<ComputerUpdateStatusDto> InstalledUpdates { get; set; } = new List<ComputerUpdateStatusDto>();
    }

    public class ComputerUpdateStatusDto
    {
        public string UpdateId { get; set; }
        public int RevisionNumber { get; set; }
        public string Title { get; set; }
        public string KbArticle { get; set; }
        public string Classification { get; set; }
        public string MsrcSeverity { get; set; }
        public string InstallationState { get; set; }
        public DateTime? ArrivalDateUtc { get; set; }
    }
}
