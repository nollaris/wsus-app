using System;
using System.Collections.Generic;

namespace WsusRestApi.Models
{
    public class UpdateDto
    {
        public string UpdateId { get; set; }
        public int RevisionNumber { get; set; }
        public string ServerId { get; set; }
        public string Title { get; set; }
        public string KbArticle { get; set; }
        public string Classification { get; set; }
        public List<string> Products { get; set; } = new List<string>();
        public string MsrcSeverity { get; set; }
        public DateTime? ArrivalDateUtc { get; set; }
        public DateTime? CreationDateUtc { get; set; }
        public bool IsApproved { get; set; }
        public bool IsDeclined { get; set; }
        public bool IsSuperseded { get; set; }
        public bool IsLatestRevision { get; set; }
        public string UpdateType { get; set; }
        public bool RequiresReboot { get; set; }

        // Summary counts across computers
        public int InstalledCount { get; set; }
        public int NeededCount { get; set; }
        public int FailedCount { get; set; }
        public int PendingRebootCount { get; set; }
        public int NotApplicableCount { get; set; }
        public int UnknownCount { get; set; }
    }

    public class UpdateDetailDto
    {
        public UpdateDto Update { get; set; }
        public string Description { get; set; }
        public List<string> AdditionalInfoUrls { get; set; } = new List<string>();
        public List<string> SupersededByUpdateIds { get; set; } = new List<string>();
        public List<UpdateApprovalDto> Approvals { get; set; } = new List<UpdateApprovalDto>();
        public List<UpdateComputerStatusDto> ComputerStatuses { get; set; } = new List<UpdateComputerStatusDto>();
    }

    public class UpdateApprovalDto
    {
        public string ApprovalId { get; set; }
        public string Action { get; set; }
        public string TargetGroupId { get; set; }
        public string TargetGroupName { get; set; }
        public string AdministratorName { get; set; }
        public DateTime? CreationDateUtc { get; set; }
        public DateTime? GoLiveTimeUtc { get; set; }
        public DateTime? DeadlineUtc { get; set; }
    }

    public class UpdateComputerStatusDto
    {
        public string ComputerId { get; set; }
        public string FullDomainName { get; set; }
        public string IpAddress { get; set; }
        public string InstallationState { get; set; }
        public DateTime? LastSyncTimeUtc { get; set; }
    }
}
