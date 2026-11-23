using System;
using System.Collections.Generic;
using WsusRestApi.Configuration;
using WsusRestApi.Models;

namespace WsusRestApi.Services
{
    public class WsusServerSnapshot
    {
        public ServerStatusDto Status { get; set; }
        public ServerSummaryDto Summary { get; set; }
        public List<ComputerDto> Computers { get; set; } = new List<ComputerDto>();
        public List<UpdateDto> Updates { get; set; } = new List<UpdateDto>();
        public List<GroupDto> Groups { get; set; } = new List<GroupDto>();
        public SyncOverviewDto Sync { get; set; }
        public DateTime CapturedAtUtc { get; set; }
    }

    public interface IWsusDataService
    {
        WsusServerSnapshot FetchServerSnapshot(WsusServerConfig serverConfig);
        ComputerDetailDto FetchComputerDetail(WsusServerConfig serverConfig, string computerId);
        UpdateDetailDto FetchUpdateDetail(WsusServerConfig serverConfig, string updateId, int? revisionNumber = null);
        GroupDetailDto FetchGroupDetail(WsusServerConfig serverConfig, string groupId);
    }
}
