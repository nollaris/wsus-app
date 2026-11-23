using System;
using System.Collections.Generic;

namespace WsusRestApi.Models
{
    public class SyncOverviewDto
    {
        public SyncOverviewDto()
        {
            History = new List<SyncHistoryItemDto>();
        }

        public string ServerId { get; set; }
        public string ServerName { get; set; }
        public SyncSettingsDto Settings { get; set; }
        public SyncStatusDto CurrentStatus { get; set; }
        public List<SyncHistoryItemDto> History { get; set; }
    }

    public class SyncSettingsDto
    {
        public bool SynchronizeAutomatically { get; set; }
        public string SynchronizationTimeOfDayUtc { get; set; }
        public int NumberOfSynchronizationsPerDay { get; set; }
        public bool SyncFromMicrosoftUpdate { get; set; }
        public string UpstreamWsusServerName { get; set; }
        public int UpstreamWsusServerPortNumber { get; set; }
        public bool UpstreamWsusServerUseSsl { get; set; }
        public bool IsReplicaServer { get; set; }
    }

    public class SyncStatusDto
    {
        public string Status { get; set; }
        public int TotalItems { get; set; }
        public int ProcessedItems { get; set; }
        public string CurrentPhase { get; set; }
    }

    public class SyncHistoryItemDto
    {
        public string SynchronizationId { get; set; }
        public DateTime? StartTimeUtc { get; set; }
        public DateTime? EndTimeUtc { get; set; }
        public double? DurationSeconds { get; set; }
        public string Result { get; set; }
        public bool StartedManually { get; set; }
        public string Error { get; set; }
        public string ErrorText { get; set; }
        public int UpdateErrorsCount { get; set; }
    }
}
