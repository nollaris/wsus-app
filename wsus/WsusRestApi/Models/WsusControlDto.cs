namespace WsusRestApi.Models
{
    public class CreateComputerTargetGroupRequest
    {
        public string Name { get; set; }
    }

    public class AddComputerToGroupRequest
    {
        public string ComputerId { get; set; }
    }

    public class ApproveUpdateRequest
    {
        public int? RevisionNumber { get; set; }
        public string TargetGroupId { get; set; }
    }

    public class StartSynchronizationDto
    {
        public string Status { get; set; }
    }

    public class UpdateApprovalResultDto
    {
        public string UpdateId { get; set; }
        public int RevisionNumber { get; set; }
        public string TargetGroupId { get; set; }
        public bool AlreadyApproved { get; set; }
    }
}
