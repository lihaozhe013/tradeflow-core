import { Card, Spin, Alert } from "antd";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { useTranslation } from "react-i18next";
import { useSimpleApiData } from "@/hooks/useSimpleApi";
import { DEFAULT_TOP_SALES_RESPONSE } from "@/pages/Overview/types";
import type { TopSalesResponse } from "@/pages/Overview/types";

const TopSalesPieChart = () => {
  const { t } = useTranslation();

  // 预定义颜色数组
  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#8884D8",
    "#82CA9D",
    "#FFC658",
    "#FF7C7C",
    "#8DD1E1",
    "#D084D0",
    "#D9D9D9",
  ] as const;

  // 使用useSimpleApiData获取销售数据
  const {
    data: salesResponse,
    loading,
    error,
  } = useSimpleApiData<TopSalesResponse>(
    "/overview/top-sales-products",
    DEFAULT_TOP_SALES_RESPONSE
  );

  const resolvedResponse = salesResponse ?? DEFAULT_TOP_SALES_RESPONSE;

  // 处理数据格式
  const chartData = resolvedResponse.success
    ? resolvedResponse.data.map((item) => ({
        name: item.product_model,
        value: item.total_sales,
      }))
    : [];

  const RADIAN = Math.PI / 180;

  // 自定义标签渲染函数
  const renderCustomizedLabel = ({
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius = 0,
    outerRadius = 0,
    percent = 0,
  }: PieLabelRenderProps) => {
    const percentNumber =
      typeof percent === "number"
        ? percent
        : typeof percent === "string"
        ? parseFloat(percent)
        : 0;

    if (Number.isNaN(percentNumber) || percentNumber < 0.05) return null; // 小于5%不显示标签

    const inner = Number(innerRadius);
    const outer = Number(outerRadius);
    const angle = Number(midAngle);
    const centerX = Number(cx);
    const centerY = Number(cy);

    const radius = inner + (outer - inner) * 0.5;
    const x = centerX + radius * Math.cos(-angle * RADIAN);
    const y = centerY + radius * Math.sin(-angle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > centerX ? "start" : "end"}
        dominantBaseline="central"
        fontSize={12}
      >
        {`${Math.round(percentNumber * 100)}%`}
      </text>
    );
  };

  if (loading) {
    return (
      <Card
        style={{
          minHeight: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin />
      </Card>
    );
  }
  if (error) {
    return <Alert type="error" message={error} style={{ minHeight: 280 }} />;
  }

  return (
    <Card
      title={t("overview.topSalesDistribution")}
      style={{
        borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
        minHeight: 270,
      }}
      bodyStyle={{ padding: "8px" }}
    >
      <div
        style={{ color: "#999", fontSize: 12, marginBottom: 8, marginLeft: 17 }}
      >
        {t("overview.includesOnlyTheModtRecentYear")}
      </div>
      <ResponsiveContainer width="100%" height={500}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={140}
            innerRadius={70}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  (entry.name === t("overview.other")
                    ? "#d9d9d9"
                    : COLORS[index % COLORS.length]) || "#0088FE"
                }
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(
              value:
                | number
                | string
                | Array<number | string>
                | ReadonlyArray<number | string>
                | undefined
            ) => [value, t("overview.salesAmount")]}
            labelFormatter={(label: any) =>
              `${t("overview.product")}: ${label}`
            }
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default TopSalesPieChart;
