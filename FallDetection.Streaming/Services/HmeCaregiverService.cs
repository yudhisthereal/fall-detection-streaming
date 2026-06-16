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
        
        // Calculate gu = bit_length(u) // 2
        private static readonly BigInteger gu = (u.GetBitLength() / 2);

        // CRT products
        private static readonly BigInteger np1prod = q1 * r * s * t * w;
        private static readonly BigInteger nq1prod = p1 * r * s * t * w;
        private static readonly BigInteger nrprod = p1 * q1 * s * t * w;
        private static readonly BigInteger nsprod = p1 * q1 * r * t * w;
        private static readonly BigInteger ntprod = p1 * q1 * r * s * w;
        private static readonly BigInteger nwprod = p1 * q1 * r * s * t;

        // CRT inverses
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
            // Ensure positive integer between 1 and 2^32 - 1 (matching Python's randint)
            uint randomUint = BitConverter.ToUInt32(bytes, 0);
            // Make sure it's at least 1
            if (randomUint == 0) randomUint = 1;
            return new BigInteger(randomUint);
        }

        private BigInteger Mod(BigInteger a, BigInteger b)
        {
            BigInteger r = a % b;
            return r < 0 ? r + b : r;
        }

        /// <summary>
        /// Encrypt with 2 moduli (p1, q1)
        /// Used for: Encrypting features
        /// Matches Python _Enc1(m)
        /// </summary>
        public string[] _Enc1(BigInteger m)
        {
            BigInteger g = GenerateRandom32Bit();
            BigInteger baseVal = (g * u) + m;
            return new[]
            {
                Mod(baseVal, p1).ToString(),
                Mod(baseVal, q1).ToString()
            };
        }

        /// <summary>
        /// Encrypt with 6 moduli (p1, q1, r, s, t, w)
        /// Used for: Re-encrypting comparison results
        /// Matches Python _Enc(m)
        /// </summary>
        private string[] _Enc(BigInteger m)
        {
            BigInteger g = GenerateRandom32Bit();
            BigInteger baseVal = (g * u) + m;
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

        /// <summary>
        /// Encrypts an already scaled integer feature (e.g. camera sends value * 100).
        /// This avoids double-truncation when upstream has already applied fixed-point scaling.
        /// </summary>
        public string[] Enc1ScaledInt(double scaledValue)
        {
            BigInteger m = new BigInteger(Math.Truncate(scaledValue));
            BigInteger g = GenerateRandom32Bit();
            BigInteger baseVal = (g * u) + m;
            return new[]
            {
                Mod(baseVal, p1).ToString(),
                Mod(baseVal, q1).ToString()
            };
        }

        /// <summary>
        /// Decrypt from 6 moduli (p1, q1, r, s, t, w)
        /// Used for: Decrypting final polynomial result
        /// Matches Python _decmul(c1, c2, c3, c4, c5, c6)
        /// </summary>
        private BigInteger _Decmul(BigInteger c1, BigInteger c2, BigInteger c3, BigInteger c4, BigInteger c5, BigInteger c6)
        {
            // CRT reconstruction
            BigInteger term1 = Mod(c1, p1) * invnp1 * np1prod;
            BigInteger term2 = Mod(c2, q1) * invnq1 * nq1prod;
            BigInteger term3 = Mod(c3, r) * invnr * nrprod;
            BigInteger term4 = Mod(c4, s) * invns * nsprod;
            BigInteger term5 = Mod(c5, t) * invnt * ntprod;
            BigInteger term6 = Mod(c6, w) * invnw * nwprod;

            BigInteger mout = Mod(term1 + term2 + term3 + term4 + term5 + term6, n1);

            // Python: if mout > n1 // 2: mout = mout - n1
            if (mout > (n1 / 2))
            {
                mout = mout - n1;
            }
            
            // Python: mout = mout % u
            mout = Mod(mout, u);
            return mout;
        }

        /// <summary>
        /// Decrypt comparison result from 2 moduli (p1, q1)
        /// Used for: Decrypting threshold comparison results
        /// Matches Python _priv_comp_cg(c111, c121)
        /// </summary>
        private BigInteger _PrivCompCg(BigInteger c111, BigInteger c121)
        {
            // CRT reconstruction for 2 moduli
            BigInteger term1 = Mod(c111, p1) * qinvp * q1;
            BigInteger term2 = Mod(c121, q1) * pinvq * p1;
            BigInteger mout = Mod(term1 + term2, n11);
            
            // Python: mout = mout % u
            mout = Mod(mout, u);
            
            // Python: rn = (mout + u) % u
            BigInteger rn = Mod(mout + u, u);
            
            // Python: tg = rn.bit_length()
            int tg = (int)rn.GetBitLength();
            
            // Python comparison logic
            // if gu > tg: gcomp = 0 (False)
            // elif gu < tg: gcomp = 1 (True)
            // else: gcomp = -1 (Undefined)
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

        /// <summary>
        /// Decrypt encrypted comparison from 2 moduli (p1, q1)
        /// Used for: Decrypting encrypted vs encrypted comparison results
        /// Matches Python _priv_comp1_cg(c11, c12)
        /// </summary>
        private BigInteger _PrivComp1Cg(BigInteger c11, BigInteger c12)
        {
            // CRT reconstruction for 2 moduli
            BigInteger term1 = Mod(c11, p1) * qinvp * q1;
            BigInteger term2 = Mod(c12, q1) * pinvq * p1;
            BigInteger mout = Mod(term1 + term2, n11);
            
            // Python: if mout > n11 // 2: mout = mout - n11
            if (mout > (n11 / 2))
            {
                mout = mout - n11;
            }
            
            // Python: mout = mout % u
            mout = Mod(mout, u);
            
            // Python: tg = mout.bit_length()
            int tg = (int)mout.GetBitLength();
            
            // Python: if gu > tg: return 0 (False) else return 1 (True)
            if (gu > tg)
            {
                return 0;
            }
            else
            {
                return 1;
            }
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

                // STEP 2: Decrypt comparison results from Analytics
                _logger.LogInformation("[HME-SVC] step2 decrypting comparison results");
                
                // Decrypt threshold comparisons using _PrivCompCg (matches Python _priv_comp_cg)
                BigInteger compT30 = _PrivCompCg(BigInteger.Parse(ir.T30[0]), BigInteger.Parse(ir.T30[1]));
                BigInteger compT40 = _PrivCompCg(BigInteger.Parse(ir.T40[0]), BigInteger.Parse(ir.T40[1]));
                BigInteger compT80 = _PrivCompCg(BigInteger.Parse(ir.T80[0]), BigInteger.Parse(ir.T80[1]));
                BigInteger compT60 = _PrivCompCg(BigInteger.Parse(ir.T60[0]), BigInteger.Parse(ir.T60[1]));

                // Decrypt encrypted comparisons using _PrivComp1Cg (matches Python _priv_comp1_cg)
                BigInteger compTc = _PrivComp1Cg(BigInteger.Parse(ir.Tc[0]), BigInteger.Parse(ir.Tc[1]));
                BigInteger compTl = _PrivComp1Cg(BigInteger.Parse(ir.Tl[0]), BigInteger.Parse(ir.Tl[1]));

                _logger.LogInformation(
                    "[HME-SVC] step2 decrypted: T30={T30}, T40={T40}, T80={T80}, T60={T60}, TC={Tc}, TL={Tl}",
                    compT30, compT40, compT80, compT60, compTc, compTl);

                // STEP 3: Re-encrypt comparison results using _Enc (6 moduli)
                // Polynomial column order: a=T30, b=T40, c=T80, d=TC, e=TL, f=T60
                _logger.LogInformation("[HME-SVC] step3 re-encrypting comparison results with 6 moduli");
                
                string[] encT30 = _Enc(compT30);
                string[] encT40 = _Enc(compT40);
                string[] encT80 = _Enc(compT80);
                string[] encTc  = _Enc(compTc);
                string[] encTl  = _Enc(compTl);
                string[] encT60 = _Enc(compT60);

                var evalPayload = new EncryptedComparisonResults
                {
                    CompA = encT30.ToList(),  // a = T30
                    CompB = encT40.ToList(),  // b = T40
                    CompC = encT80.ToList(),  // c = T80
                    CompD = encTc.ToList(),   // d = TC
                    CompE = encTl.ToList(),   // e = TL
                    CompF = encT60.ToList()   // f = T60
                };

                var evalPayloadJson = JsonSerializer.Serialize(evalPayload);
                _logger.LogInformation(
                    "[HME-SVC] step3 analytics-request body={Body}",
                    evalPayloadJson);

                var step3Stopwatch = System.Diagnostics.Stopwatch.StartNew();
                var evalResResponse = await _httpClient.PostAsJsonAsync($"{_analyticsBaseUrl}/evaluate-polynomial", evalPayload);
                step3Stopwatch.Stop();
                _logger.LogInformation(
                    "[HME-SVC] step3 evaluate-polynomial status={StatusCode} elapsed_ms={ElapsedMs}",
                    (int)evalResResponse.StatusCode,
                    step3Stopwatch.ElapsedMilliseconds);

                if (!evalResResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Analytics Step 3 failed with {evalResResponse.StatusCode}");
                    return "None";
                }

                var evalResJson = await evalResResponse.Content.ReadAsStringAsync();
                _logger.LogInformation(
                    "[HME-SVC] step3 analytics-response body={Body}",
                    evalResJson);
                string finalLabel;

                // Parse response - expect polynomial_results array of 6 values
                var evalEnvelope = JsonSerializer.Deserialize<AnalyticsStep2Response>(evalResJson);
                var poly = evalEnvelope?.EvaluationResult?.PolynomialResults;
                if ((poly?.Length ?? 0) >= 6)
                {
                    _logger.LogInformation("[HME-SVC] step3 parsed polynomial_results_len={PolyLen}", poly!.Length);

                    // STEP 4: Decrypt final polynomial result using _Decmul (matches Python _decmul)
                    BigInteger classIndex = _Decmul(
                        BigInteger.Parse(poly[0]), BigInteger.Parse(poly[1]),
                        BigInteger.Parse(poly[2]), BigInteger.Parse(poly[3]),
                        BigInteger.Parse(poly[4]), BigInteger.Parse(poly[5])
                    );

                    _logger.LogInformation("[HME-SVC] step4 decrypted class_index={ClassIndex}", classIndex.ToString());

                    // Map class index to pose label
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
                            "[HME-SVC] step3 invalid payload polynomial_results_len={PolyLen} msb_len={MsbLen} lsb_len={LsbLen}",
                            poly?.Length ?? 0,
                            evalRes?.MsbRes?.Length ?? 0,
                            evalRes?.LsbRes?.Length ?? 0);
                        return "None";
                    }

                    _logger.LogInformation(
                        "[HME-SVC] step3 parsed msb_len={MsbLen} lsb_len={LsbLen}",
                        evalRes.MsbRes!.Length,
                        evalRes.LsbRes!.Length);

                    // Decrypt MSB and LSB separately
                    BigInteger msb = _Decmul(
                        BigInteger.Parse(evalRes.MsbRes[0]), BigInteger.Parse(evalRes.MsbRes[1]),
                        BigInteger.Parse(evalRes.MsbRes[2]), BigInteger.Parse(evalRes.MsbRes[3]),
                        BigInteger.Parse(evalRes.MsbRes[4]), BigInteger.Parse(evalRes.MsbRes[5])
                    );

                    BigInteger lsb = _Decmul(
                        BigInteger.Parse(evalRes.LsbRes[0]), BigInteger.Parse(evalRes.LsbRes[1]),
                        BigInteger.Parse(evalRes.LsbRes[2]), BigInteger.Parse(evalRes.LsbRes[3]),
                        BigInteger.Parse(evalRes.LsbRes[4]), BigInteger.Parse(evalRes.LsbRes[5])
                    );

                    _logger.LogInformation("[HME-SVC] step3 decrypt bits msb={Msb} lsb={Lsb}", msb.ToString(), lsb.ToString());

                    // Python reference maps: 0=standing, 1=sitting, 2=bending_down, 3=lying_down
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