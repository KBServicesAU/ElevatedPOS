{{- define "nexus.labels" -}}
app.kubernetes.io/name: nexus
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "nexus.serviceLabels" -}}
{{ include "nexus.labels" . }}
app.kubernetes.io/component: {{ .serviceName }}
{{- end }}

{{- define "nexus.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "nexus.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}
