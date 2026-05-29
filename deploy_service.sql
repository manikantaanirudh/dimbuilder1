DROP SERVICE IF EXISTS DEMO_OPENFLOW.OS_METADATA.SR_OS_METADATABUILDER FORCE;

CREATE SERVICE DEMO_OPENFLOW.OS_METADATA.SR_OS_METADATABUILDER
  IN COMPUTE POOL EST_APP_COMPUTE_POOL
  FROM SPECIFICATION $$
spec:
  containers:
  - name: app
    image: /demo_openflow/os_metadata/sr_os_metadatabuilder_repo/sr_os_metadatabuilder:latest
    env:
      HOST: "0.0.0.0"
      PORT: "8787"
      NODE_ENV: "production"
      DATABASE_FILE: "/app/data/app.db"
      METADATA_DIRECTORY: "/app/data/metadata"
      AUTH_ENABLED: "false"
    readinessProbe:
      port: 8787
      path: /api/health
    volumeMounts:
    - name: appdata
      mountPath: /app/data
    resources:
      requests:
        memory: 512Mi
        cpu: "0.25"
      limits:
        memory: 1Gi
        cpu: "0.5"
  endpoints:
  - name: web
    port: 8787
    public: true
  volumes:
  - name: appdata
    source: block
    size: 10Gi
$$
  MIN_INSTANCES = 1
  MAX_INSTANCES = 1
  COMMENT = 'SR OS MetadataBuilder - OneStream Dim Builder (Node/SQLite on block volume)';
