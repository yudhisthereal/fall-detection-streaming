using System.Text.Json.Serialization;

namespace FallDetection.Streaming.Models
{
    public class EncryptedPoseFeatures
    {
        [JsonPropertyName("tra")]
        public string[] Tra { get; set; } = new string[2];

        [JsonPropertyName("tha")]
        public string[] Tha { get; set; } = new string[2];

        [JsonPropertyName("thl")]
        public string[] Thl { get; set; } = new string[2];

        [JsonPropertyName("cl")]
        public string[] Cl { get; set; } = new string[2];

        [JsonPropertyName("trl")]
        public string[] Trl { get; set; } = new string[2];

        [JsonPropertyName("ll")]
        public string[] Ll { get; set; } = new string[2];
    }

    public class EncryptedIntermediateResults
    {
        [JsonPropertyName("eicr_g")]
        public string[] EicrG { get; set; } = new string[2];

        [JsonPropertyName("eicr_parts")]
        public string[][] EicrParts { get; set; } = new string[5][];
    }

    /// <summary>
    /// Actual response envelope from analytics /compute-intermediate endpoint.
    /// </summary>
    public class AnalyticsStep1Response
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("intermediate_results")]
        public Step1IntermediateResults? IntermediateResults { get; set; }
    }

    /// <summary>
    /// Named intermediate comparison pairs returned by the analytics server.
    /// t30/t40/t80/t60 = encrypted vs plaintext threshold (use PrivCompCg).
    /// tc/tl           = encrypted vs encrypted comparison (use PrivComp1Cg).
    /// </summary>
    public class Step1IntermediateResults
    {
        [JsonPropertyName("t30")]
        public string[]? T30 { get; set; }

        [JsonPropertyName("t40")]
        public string[]? T40 { get; set; }

        [JsonPropertyName("t80")]
        public string[]? T80 { get; set; }

        [JsonPropertyName("t60")]
        public string[]? T60 { get; set; }

        [JsonPropertyName("tc")]
        public string[]? Tc { get; set; }

        [JsonPropertyName("tl")]
        public string[]? Tl { get; set; }
    }

    public class EncryptedComparisonResults
    {
        [JsonPropertyName("comp_a")]
        public List<string> CompA { get; set; } = new();

        [JsonPropertyName("comp_b")]
        public List<string> CompB { get; set; } = new();

        [JsonPropertyName("comp_c")]
        public List<string> CompC { get; set; } = new();

        [JsonPropertyName("comp_d")]
        public List<string> CompD { get; set; } = new();

        [JsonPropertyName("comp_e")]
        public List<string> CompE { get; set; } = new();

        [JsonPropertyName("comp_f")]
        public List<string> CompF { get; set; } = new();
    }

    public class EvaluationResult
    {
        [JsonPropertyName("msb_res")]
        public string[]? MsbRes { get; set; }

        [JsonPropertyName("lsb_res")]
        public string[]? LsbRes { get; set; }
    }

    /// <summary>
    /// Actual response envelope from analytics /evaluate-polynomial endpoint.
    /// </summary>
    public class AnalyticsStep2Response
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("evaluation_result")]
        public Step2EvaluationResult? EvaluationResult { get; set; }
    }

    public class Step2EvaluationResult
    {
        [JsonPropertyName("polynomial_results")]
        public string[]? PolynomialResults { get; set; }

        [JsonPropertyName("msb_res")]
        public string[]? MsbRes { get; set; }

        [JsonPropertyName("lsb_res")]
        public string[]? LsbRes { get; set; }
    }
}
