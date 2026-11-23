using System.Collections.Generic;

namespace WsusRestApi.Models
{
    public class GroupDto
    {
        public string GroupId { get; set; }
        public string ServerId { get; set; }
        public string Name { get; set; }
        public int TotalComputers { get; set; }
        public int CompliantComputers { get; set; }
        public int ComputersNeedingUpdates { get; set; }
        public int ComputersWithErrors { get; set; }
        public double CompliancePercent { get; set; }
    }

    public class GroupDetailDto
    {
        public GroupDto Group { get; set; }
        public List<ComputerDto> Computers { get; set; } = new List<ComputerDto>();
    }
}
