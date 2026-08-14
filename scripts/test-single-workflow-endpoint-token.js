require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

(async () => {
  const base = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
  const token = process.env.KAZE_API_TOKEN;
  if (!token) throw new Error("KAZE_API_TOKEN manquant");

  const headers = {
    Authorization: token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const workflowId = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";
  const now = Date.now();
  const start = now + 24 * 3600 * 1000;

  const payload = {
    data: {
      job_info: {
        job_info: {
          job_title: `QA-TOKEN-${String(now).slice(-6)}`,
          job_reference: `DLC-TOK-${String(now).slice(-6)}`,
          job_due_date: start,
          job_start_date: start,
          job_end_date: start + 21600000,
          job_address: "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
          job_location: "43.6743,1.5041",
          performer_estimation: 360,
        },
      },
      start_navigation: {
        start_navigation: {
          address: "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
          location: "43.6743,1.5041",
        },
      },
      end_navigation: {
        end_navigation: {
          address: "10 Rue de Rivoli, 75001 Paris",
          location: "48.8568,2.3522",
        },
      },
    },
  };

  const created = await axios.post(
    `${base}/job_workflows/${workflowId}/job.json`,
    payload,
    { headers, timeout: 15000 },
  );

  const id = created.data?.id;
  const { data: job } = await axios.get(`${base}/jobs/${id}`, {
    headers,
    timeout: 15000,
  });

  console.log(
    JSON.stringify(
      {
        id,
        status: job.status,
        job_workflow_id: job.job_workflow_id,
        target_id: job.target_id,
        current_step_id: job.current_step_id,
        first_not_completed_step_id: job.first_not_completed_step_id,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error("ERR_STATUS", e.response?.status || "n/a");
  console.error("ERR_BODY", JSON.stringify(e.response?.data || e.message));
  process.exit(1);
});
