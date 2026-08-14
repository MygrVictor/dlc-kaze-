require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

(async () => {
  const base = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";

  const loginRes = await axios.post(
    `${base}/login`,
    {
      user: {
        login: process.env.KAZE_LOGIN,
        password: process.env.KAZE_PASSWORD,
        api_key: process.env.KAZE_API_KEY,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );

  const headers = {
    Authorization: `Bearer ${loginRes.data.jwt.access_token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const workflowId = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";
  const wf = (
    await axios.get(`${base}/job_workflows/${workflowId}`, { headers })
  ).data;

  const now = Date.now();
  const start = now + 24 * 3600 * 1000;

  const data = {};
  for (const step of wf.workflow.children || []) {
    data[step.id] = {
      [step.id]: {},
    };
  }

  data.job_info.job_info = {
    job_title: `QA-ALLSTEPS-${String(now).slice(-6)}`,
    job_reference: `DLC-ALL-${String(now).slice(-6)}`,
    job_due_date: start,
    job_start_date: start,
    job_end_date: start + 21600000,
    job_address: "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
    job_location: "43.6743,1.5041",
    performer_estimation: 360,
  };

  data.start_navigation.start_navigation = {
    address: "21 Avenue Leon Jouhaux, 31140 Saint-Alban",
    location: "43.6743,1.5041",
  };
  data.end_navigation.end_navigation = {
    address: "10 Rue de Rivoli, 75001 Paris",
    location: "48.8568,2.3522",
  };

  const payload = { data };

  const created = await axios.post(
    `${base}/job_workflows/${workflowId}/job.json`,
    payload,
    { headers },
  );
  const id = created.data?.id;
  const job = (await axios.get(`${base}/jobs/${id}`, { headers })).data;

  console.log(
    JSON.stringify(
      {
        id,
        status: job.status,
        job_workflow_id: job.job_workflow_id,
        target_id: job.target_id,
        current_step_id: job.current_step_id,
        first_not_completed_step_id: job.first_not_completed_step_id,
        steps_count: (job.steps || []).length,
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
