import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "../_components/page-skeletons";

export default function UsersLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-56" subtitleWidth="w-96" />
      <FilterBarSkeleton filterCount={1} />
      <TableSkeleton columns={4} rows={6} />
    </div>
  );
}
