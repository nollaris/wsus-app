using System;
using System.Collections.Generic;
using WsusRestApi.Models;

namespace WsusRestApi.Services
{
    public class WsusLocalSnapshot
    {
        public WsusLocalSnapshot()
        {
            Computers = new List<ComputerDto>();
            Updates = new List<UpdateDto>();
            Groups = new List<GroupDto>();
        }

        public ServerSummaryDto Summary { get; set; }
        public List<ComputerDto> Computers { get; set; }
        public List<UpdateDto> Updates { get; set; }
        public List<GroupDto> Groups { get; set; }
        public SyncOverviewDto Sync { get; set; }
        public DateTime CapturedAtUtc { get; set; }
    }

    public interface IWsusDataService
    {
        WsusLocalSnapshot FetchLocalSnapshot();
        ComputerDetailDto FetchComputerDetail(string computerId);
        UpdateDetailDto FetchUpdateDetail(string updateId, int? revisionNumber = null);
        GroupDetailDto FetchGroupDetail(string groupId);
        GroupDto CreateComputerTargetGroup(string name);
        GroupDto AddComputerToGroup(string groupId, string computerId);
        void StartSynchronization();
        bool ApproveUpdate(string updateId, int? revisionNumber, string targetGroupId);
    }
}
