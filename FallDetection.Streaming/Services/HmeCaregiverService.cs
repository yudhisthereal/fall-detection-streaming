using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Numerics;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
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
                var interResResponse = await _httpClient.PostAsJsonAsync($"{_analyticsBaseUrl}/compute-intermediate", reqFeatures);
                if (!interResResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Analytics Step 1 failed with {interResResponse.StatusCode}");
                    return "None";
                }

                var interRes = await interResResponse.Content.ReadFromJsonAsync<EncryptedIntermediateResults>();
                if (interRes == null || interRes.EicrG.Length < 2 || interRes.EicrParts.Length < 5) return "None";

                BigInteger compG = PrivCompCg(BigInteger.Parse(interRes.EicrG[0]), BigInteger.Parse(interRes.EicrG[1]));
                string[] encCompG = Enc(compG);

                string[][] encCompParts = new string[5][];
                for (int i = 0; i < 5; i++)
                {
                    BigInteger compVal;
                    if (i == 4)
                    {
                        compVal = PrivCompCg(BigInteger.Parse(interRes.EicrParts[i][0]), BigInteger.Parse(interRes.EicrParts[i][1]));
                    }
                    else
                    {
                        compVal = PrivComp1Cg(BigInteger.Parse(interRes.EicrParts[i][0]), BigInteger.Parse(interRes.EicrParts[i][1]));
                    }
                    encCompParts[i] = Enc(compVal);
                }

                var evalPayload = new EncryptedComparisonResults
                {
                    EncCompG = encCompG,
                    EncCompParts = encCompParts
                };

                var evalResResponse = await _httpClient.PostAsJsonAsync($"{_analyticsBaseUrl}/evaluate-polynomial", evalPayload);
                if (!evalResResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Analytics Step 2 failed with {evalResResponse.StatusCode}");
                    return "None";
                }

                var evalRes = await evalResResponse.Content.ReadFromJsonAsync<EvaluationResult>();
                if (evalRes == null || evalRes.MsbRes.Length < 6 || evalRes.LsbRes.Length < 6) return "None";

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

                if (msb == 1 && lsb == 1) return "standing";
                if (msb == 1 && lsb == 0) return "sitting";
                if (msb == 0 && lsb == 1) return "bending down";
                if (msb == 0 && lsb == 0) return "lying down";
                return "None";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing HME pose data");
                return "None";
            }
        }
    }
}
