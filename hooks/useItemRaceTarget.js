import { useEffect, useState } from "react";
import { fetchPageSummary } from "../services/wikiService.js";
import { getTargetSummaryText, TARGET_SUMMARY_STATUS } from "../utils/groupTargetSummary.js";

export default function useItemRaceTarget(title) {
  const [brief, setBrief] = useState(null);
  useEffect(() => {
    if (!title) return undefined;
    const controller = new AbortController();
    fetchPageSummary(title, { signal:controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      const summary = getTargetSummaryText(data);
      setBrief({ title, summary, summaryStatus:summary ? TARGET_SUMMARY_STATUS.SUCCESS : TARGET_SUMMARY_STATUS.EMPTY });
    }).catch(() => {
      if (!controller.signal.aborted) setBrief({ title, summaryStatus:TARGET_SUMMARY_STATUS.ERROR });
    });
    return () => controller.abort();
  }, [title]);
  return brief?.title === title ? brief : { title, summaryStatus:TARGET_SUMMARY_STATUS.LOADING };
}
