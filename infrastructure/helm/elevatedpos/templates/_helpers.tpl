{{- define "elevatedpos.labels" -}}
app.kubernetes.io/name: elevatedpos
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "elevatedpos.serviceLabels" -}}
{{ include "elevatedpos.labels" . }}
app.kubernetes.io/component: {{ .serviceName }}
{{- end }}

{{- define "elevatedpos.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "elevatedpos.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}
