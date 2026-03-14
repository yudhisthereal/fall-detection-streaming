using System.Numerics;
using System.Security.Cryptography;
using System.Text.Json;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public class HmeCaregiverService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<HmeCaregiverService> _logger;
        private readonly string? _analyticsBaseUrl;

        // Cryptographic keys at caregiver
        private static readonly BigInteger p1 = BigInteger.Parse("234406548094233827948571379965547188853");
        private static readonly BigInteger q1 = BigInteger.Parse("583457592311129510314141861330330044443");
        private static readonly BigInteger r = BigInteger.Parse("696522972436164062959242838052087531431");
        private static readonly BigInteger s = BigInteger.Parse("374670603170509799404699393785831797599");
        private static readonly BigInteger t = BigInteger.Parse("443137959904584298054176676987615849169");
        private static readonly BigInteger w = BigInteger.Parse("391475886865055383118586393345880578361");
        private static readonly BigInteger u = BigInteger.Parse("2355788435550222327802749264573303139783");

        private static readonly BigInteger n1 = p1 * q1 * r * s * t * w;

        private static readonly BigInteger pinvq = BigInteger.Parse("499967064455987294076532081570894386372");
        private static readonly BigInteger qinvp = BigInteger.Parse("33542671637141449679641257954160235148");
        private static readonly BigInteger n11 = p1 * q1;
        private static readonly BigInteger gu = 65; // Calculate bit_length() // 2 of u

        private static readonly BigInteger np1prod = q1 * r * s * t * w;
        private static readonly BigInteger nq1prod = p1 * r * s * t * w;
        private static readonly BigInteger nrprod = p1 * q1 * s * t * w;
        private static readonly BigInteger nsprod = p1 * q1 * r * t * w;
        private static readonly BigInteger ntprod = p1 * q1 * r * s * w;
        private static readonly BigInteger nwprod = p1 * q1 * r * s * t; // wait let me double check Python lines 28
        // Actually I'll just hardcode them based on the python source I just verified!
        private static readonly BigInteger invnp1 = BigInteger.Parse("205139046479782337030801215788009754117");
        private static readonly BigInteger invnq1 = BigInteger.Parse("429235397156384978572995593851807405098");
        private static readonly BigInteger invnr = BigInteger.Parse("592155359269217457562309991915739180471");
        private static readonly BigInteger invns = BigInteger.Parse("115186784058467557094932562011798848762");
        private static readonly BigInteger invnt = BigInteger.Parse("51850665316568177665825586294193267244");
        private static readonly BigInteger invnw = BigInteger.Parse("44855536902472009823152313099539628632");

        public HmeCaregiverService(HttpClient httpClient, IConfiguration config, ILogger<HmeCaregiverService> logger)
        {
            _httpClient = httpClient;
            _logger = logger;
            _analyticsBaseUrl = config["Analytics:BaseUrl"] ?? "http://102.127.136.213:5000/api/Analytics";
        }

        private BigInteger GenerateRandom32Bit()
        {
            byte[] bytes = new byte[4];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(bytes);
            }
            // Ensure positive integer
            uint randomUint = BitConverter.ToUInt32(bytes, 0);
            return new BigInteger(randomUint);
        }

        private BigInteger Mod(BigInteger a, BigInteger b)
        {
            BigInteger r = a % b;
            return r < 0 ? r + b : r;
        }

        private BigInteger Truncate(double num)
        {
            double factor = 100.0;
            return new BigInteger(Math.Truncate(num * factor));
        }

        public string[] Enc1Truncated(double num)
        {
            BigInteger m = Truncate(num);
            BigInteger g = GenerateRandom32Bit();
            BigInteger baseVal = g * u + m;
            return new[]
            {
                Mod(baseVal, p1).ToString(),
                Mod(baseVal, q1).ToString()
            };
        }

        /// <summary>
        /// Encrypts an already scaled integer feature (e.g. camera sends value * 100).
        /// This avoids double-truncation when upstream has already applied fixed-point scaling.
        /// </summary>
        public string[] Enc1ScaledInt(double scaledValue)
        {
            BigInteger m = new BigInteger(Math.Truncate(scaledValue));
            BigInteger g = GenerateRandom32Bit();
            BigInteger baseVal = g * u + m;
            return new[]
            {
                Mod(baseVal, p1).ToString(),
                Mod(baseVal, q1).ToString()
            };
        }

        private string[] Enc(BigInteger m)
        {
            BigInteger g = GenerateRandom32Bit();
            BigInteger baseVal = g * u + m;
            return new[]
            {
                Mod(baseVal, p1).ToString(),
                Mod(baseVal, q1).ToString(),
                Mod(baseVal, r).ToString(),
                Mod(baseVal, s).ToString(),
                Mod(baseVal, t).ToString(),
                Mod(baseVal, w).ToString()
            };
        }

        private BigInteger Decmul(BigInteger c1, BigInteger c2, BigInteger c3, BigInteger c4, BigInteger c5, BigInteger c6)
        {
            BigInteger term1 = Mod(c1, p1) * invnp1 * np1prod;
            BigInteger term2 = Mod(c2, q1) * invnq1 * nq1prod;
            BigInteger term3 = Mod(c3, r) * invnr * nrprod;
            BigInteger term4 = Mod(c4, s) * invns * nsprod;
            BigInteger term5 = Mod(c5, t) * invnt * ntprod;
            BigInteger term6 = Mod(c6, w) * invnw * nwprod;

            BigInteger mout = Mod(term1 + term2 + term3 + term4 + term5 + term6, n1);

            if (mout > n1 / 2)
            {
                mout = mout - n1;
            }
            mout = Mod(mout, u);
            return mout;
        }

        private BigInteger PrivCompCg(BigInteger c111, BigInteger c121)
        {
            BigInteger term1 = Mod(c111, p1) * qinvp * q1;
            BigInteger term2 = Mod(c121, q1) * pinvq * p1;
            BigInteger mout = Mod(Mod(term1 + term2, n11), u);

            BigInteger rn = Mod(mout + u, u);
            int tg = (int)rn.GetBitLength();

            BigInteger gcomp = -5;
            if (gu > tg)
            {
                gcomp = 0;
            }
            else if (gu < tg)
            {
                gcomp = 1;
            }
            else
            {
                gcomp = -1;
            }
            return gcomp;
        }

        private BigInteger PrivComp1Cg(BigInteger c11, BigInteger c12)
        {
            BigInteger term1 = Mod(c11, p1) * qinvp * q1;
            BigInteger term2 = Mod(c12, q1) * pinvq * p1;
            BigInteger mout = Mod(term1 + term2, n11);

            if (mout > n11 / 2)
            {
                mout = mout - n11;
            }
            mout = Mod(mout, u);

            int tg = (int)mout.GetBitLength();
            BigInteger gcomp1 = -5;
            if (gu > tg)
            {
                gcomp1 = 0;
            }
            else if (gu < tg)
            {
                gcomp1 = 1;
            }
            else
            {
                gcomp1 = -1;
            }
            return gcomp1;
        }

        public async Task<string> ProcessPoseDataAsync(EncryptedPoseFeatures reqFeatures)
        {
            try
            {
                var totalStopwatch = System.Diagnostics.Stopwatch.StartNew();
                _logger.LogInformation(
                    "[HME-SVC] process start tra={TraLen} tha={ThaLen} thl={ThlLen} cl={ClLen} trl={TrlLen} ll={LlLen}",
                    reqFeatures.Tra?.Length ?? 0,
                    reqFeatures.Tha?.Length ?? 0,
                    reqFeatures.Thl?.Length ?? 0,
                    reqFeatures.Cl?.Length ?? 0,
                    reqFeatures.Trl?.Length ?? 0,
                    reqFeatures.Ll?.Length ?? 0);

                var step1Stopwatch = System.Diagnostics.Stopwatch.StartNew();
                var interResResponse = await _httpClient.PostAsJsonAsync($"{_analyticsBaseUrl}/compute-intermediate", reqFeatures);
                step1Stopwatch.Stop();
                _logger.LogInformation(
                    "[HME-SVC] step1 compute-intermediate status={StatusCode} elapsed_ms={ElapsedMs}",
                    (int)interResResponse.StatusCode,
                    step1Stopwatch.ElapsedMilliseconds);

                if (!interResResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Analytics Step 1 failed with {interResResponse.StatusCode}");
                    return "None";
                }

                var interResJson = await interResResponse.Content.ReadAsStringAsync();
                _logger.LogInformation(
                    "[HME-SVC] step1 analytics-response body={Body}",
                    interResJson);
                var interRes = JsonSerializer.Deserialize<AnalyticsStep1Response>(interResJson);
                var ir = interRes?.IntermediateResults;
                if (ir == null ||
                    (ir.T30?.Length ?? 0) < 2 || (ir.T40?.Length ?? 0) < 2 || (ir.T80?.Length ?? 0) < 2 ||
                    (ir.T60?.Length ?? 0) < 2 || (ir.Tc?.Length  ?? 0) < 2 || (ir.Tl?.Length  ?? 0) < 2)
                {
                    _logger.LogWarning(
                        "[HME-SVC] step1 invalid payload: missing or incomplete intermediate_results fields " +
                        "t30={T30Len} t40={T40Len} t80={T80Len} t60={T60Len} tc={TcLen} tl={TlLen}",
                        ir?.T30?.Length ?? 0, ir?.T40?.Length ?? 0, ir?.T80?.Length ?? 0,
                        ir?.T60?.Length ?? 0, ir?.Tc?.Length  ?? 0, ir?.Tl?.Length  ?? 0);
                    return "None";
                }

                _logger.LogInformation(
                    "[HME-SVC] step1 parsed t30=[{T30_0},{T30_1}] t40=[{T40_0},{T40_1}] t80=[{T80_0},{T80_1}] t60=[{T60_0},{T60_1}] tc=[{Tc_0},{Tc_1}] tl=[{Tl_0},{Tl_1}]",
                    ir.T30![0], ir.T30[1], ir.T40![0], ir.T40[1], ir.T80![0], ir.T80[1],
                    ir.T60![0], ir.T60[1], ir.Tc![0],  ir.Tc[1],  ir.Tl![0],  ir.Tl[1]);

                // PrivCompCg: decrypt results of encrypted-vs-plaintext-threshold comparisons
                BigInteger compT30 = PrivCompCg(BigInteger.Parse(ir.T30[0]), BigInteger.Parse(ir.T30[1]));
                BigInteger compT40 = PrivCompCg(BigInteger.Parse(ir.T40[0]), BigInteger.Parse(ir.T40[1]));
                BigInteger compT80 = PrivCompCg(BigInteger.Parse(ir.T80[0]), BigInteger.Parse(ir.T80[1]));
                BigInteger compT60 = PrivCompCg(BigInteger.Parse(ir.T60[0]), BigInteger.Parse(ir.T60[1]));

                // PrivComp1Cg: decrypt results of encrypted-vs-encrypted comparisons
                BigInteger compTc = PrivComp1Cg(BigInteger.Parse(ir.Tc[0]), BigInteger.Parse(ir.Tc[1]));
                BigInteger compTl = PrivComp1Cg(BigInteger.Parse(ir.Tl[0]), BigInteger.Parse(ir.Tl[1]));

                // Encrypt all 6 comparison results (6 CRT residues each)
                // Polynomial column order: T30(a), T40(b), T80(c), TC(d), TL(e), T60(f)
                string[] encT30 = Enc(compT30);
                string[] encT40 = Enc(compT40);
                string[] encT80 = Enc(compT80);
                string[] encTc  = Enc(compTc);
                string[] encTl  = Enc(compTl);
                string[] encT60 = Enc(compT60);

                var evalPayload = new EncryptedComparisonResults
                {
                    CompA = encT30.ToList(),
                    CompB = encT40.ToList(),
                    CompC = encT80.ToList(),
                    CompD = encTc.ToList(),
                    CompE = encTl.ToList(),
                    CompF = encT60.ToList()
                };

                var evalPayloadJson = JsonSerializer.Serialize(evalPayload);
                _logger.LogInformation(
                    "[HME-SVC] step2 analytics-request body={Body}",
                    evalPayloadJson);

                var step2Stopwatch = System.Diagnostics.Stopwatch.StartNew();
                var evalResResponse = await _httpClient.PostAsJsonAsync($"{_analyticsBaseUrl}/evaluate-polynomial", evalPayload);
                step2Stopwatch.Stop();
                _logger.LogInformation(
                    "[HME-SVC] step2 evaluate-polynomial status={StatusCode} elapsed_ms={ElapsedMs}",
                    (int)evalResResponse.StatusCode,
                    step2Stopwatch.ElapsedMilliseconds);

                if (!evalResResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Analytics Step 2 failed with {evalResResponse.StatusCode}");
                    return "None";
                }

                var evalResJson = await evalResResponse.Content.ReadAsStringAsync();
                _logger.LogInformation(
                    "[HME-SVC] step2 analytics-response body={Body}",
                    evalResJson);
                string finalLabel;

                // Preferred/actual server response shape:
                // { status: "success", evaluation_result: { polynomial_results: [6 values] } }
                var evalEnvelope = JsonSerializer.Deserialize<AnalyticsStep2Response>(evalResJson);
                var poly = evalEnvelope?.EvaluationResult?.PolynomialResults;
                if ((poly?.Length ?? 0) >= 6)
                {
                    _logger.LogInformation("[HME-SVC] step2 parsed polynomial_results_len={PolyLen}", poly!.Length);

                    BigInteger classIndex = Decmul(
                        BigInteger.Parse(poly[0]), BigInteger.Parse(poly[1]),
                        BigInteger.Parse(poly[2]), BigInteger.Parse(poly[3]),
                        BigInteger.Parse(poly[4]), BigInteger.Parse(poly[5])
                    );

                    _logger.LogInformation("[HME-SVC] decrypt class_index={ClassIndex}", classIndex.ToString());

                    if (classIndex == 0) finalLabel = "standing";
                    else if (classIndex == 1) finalLabel = "sitting";
                    else if (classIndex == 2) finalLabel = "bending_down";
                    else if (classIndex == 3) finalLabel = "lying_down";
                    else finalLabel = "None";
                }
                else
                {
                    // Backward compatibility: legacy shape with msb_res/lsb_res
                    var evalRes = JsonSerializer.Deserialize<EvaluationResult>(evalResJson);
                    if (evalRes == null || (evalRes.MsbRes?.Length ?? 0) < 6 || (evalRes.LsbRes?.Length ?? 0) < 6)
                    {
                        _logger.LogWarning(
                            "[HME-SVC] step2 invalid payload polynomial_results_len={PolyLen} msb_len={MsbLen} lsb_len={LsbLen}",
                            poly?.Length ?? 0,
                            evalRes?.MsbRes?.Length ?? 0,
                            evalRes?.LsbRes?.Length ?? 0);
                        return "None";
                    }

                    _logger.LogInformation(
                        "[HME-SVC] step2 parsed msb_len={MsbLen} lsb_len={LsbLen}",
                        evalRes.MsbRes!.Length,
                        evalRes.LsbRes!.Length);

                    BigInteger msb = Decmul(
                        BigInteger.Parse(evalRes.MsbRes[0]), BigInteger.Parse(evalRes.MsbRes[1]),
                        BigInteger.Parse(evalRes.MsbRes[2]), BigInteger.Parse(evalRes.MsbRes[3]),
                        BigInteger.Parse(evalRes.MsbRes[4]), BigInteger.Parse(evalRes.MsbRes[5])
                    );

                    BigInteger lsb = Decmul(
                        BigInteger.Parse(evalRes.LsbRes[0]), BigInteger.Parse(evalRes.LsbRes[1]),
                        BigInteger.Parse(evalRes.LsbRes[2]), BigInteger.Parse(evalRes.LsbRes[3]),
                        BigInteger.Parse(evalRes.LsbRes[4]), BigInteger.Parse(evalRes.LsbRes[5])
                    );

                    _logger.LogInformation("[HME-SVC] decrypt bits msb={Msb} lsb={Lsb}", msb.ToString(), lsb.ToString());

                    // Python reference computes class index as: mout = 2*msb + lsb
                    // and maps: 0=standing, 1=sitting, 2=bending_down, 3=lying_down
                    if (msb == 0 && lsb == 0) finalLabel = "standing";
                    else if (msb == 0 && lsb == 1) finalLabel = "sitting";
                    else if (msb == 1 && lsb == 0) finalLabel = "bending_down";
                    else if (msb == 1 && lsb == 1) finalLabel = "lying_down";
                    else finalLabel = "None";
                }

                totalStopwatch.Stop();
                _logger.LogInformation("[HME-SVC] process done label={Label} total_elapsed_ms={ElapsedMs}", finalLabel, totalStopwatch.ElapsedMilliseconds);

                return finalLabel;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing HME pose data");
                return "None";
            }
        }
    }
}
