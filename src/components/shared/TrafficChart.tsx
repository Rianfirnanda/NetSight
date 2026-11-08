import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Sample } from "../../types";
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);
export function TrafficChart({
  samples,
  theme,
}: {
  samples: Sample[];
  theme: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      animation: false,
      color: ["#6b9dff", "#61bba9"],
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: unknown) => `${Number(v).toFixed(2)} MB/s`,
      },
      grid: { left: 44, right: 12, top: 20, bottom: 28 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: samples.map((s) =>
          new Date(s.at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        ),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#818b9b", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        name: "MB/s",
        nameTextStyle: { color: "#818b9b" },
        axisLabel: { color: "#818b9b", fontSize: 10 },
        splitLine: {
          lineStyle: { color: theme === "dark" ? "#262d37" : "#e7eaf0" },
        },
      },
      series: [
        {
          name: "Download",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.08 },
          data: samples.map((s) => s.download / 1e6),
        },
        {
          name: "Upload",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2 },
          data: samples.map((s) => s.upload / 1e6),
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [samples, theme]);
  return (
    <div
      ref={ref}
      className="chart"
      role="img"
      aria-label="Download and upload history in megabytes per second"
    />
  );
}
