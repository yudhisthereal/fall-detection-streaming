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

    public class EncryptedComparisonResults
    {
        [JsonPropertyName("enc_comp_g")]
        public string[] EncCompG { get; set; } = new string[2];

        [JsonPropertyName("enc_comp_parts")]
        public string[][] EncCompParts { get; set; } = new string[5][];
    }

    public class EvaluationResult
    {
        [JsonPropertyName("msb_res")]
        public string[] MsbRes { get; set; } = new string[6];

        [JsonPropertyName("lsb_res")]
        public string[] LsbRes { get; set; } = new string[6];
    }
}
