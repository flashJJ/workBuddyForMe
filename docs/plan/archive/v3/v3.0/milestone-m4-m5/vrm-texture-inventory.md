# VRM 贴图清单（v3.0 S6 后续）

> 由 `apps/web/scripts/inspect-vrm-textures.mjs` 生成，只读统计，不修改模型。
> 「可有损」= 无 alpha 或无材质实际使用 alpha 的 albedo，可转 WebP q88–92；「无损压缩」= alpha 被 MASK/BLEND 材质使用的贴图，建议无损 WebP 或 PNG 量化；
> 「保留原样」= 法线/mask/matcap/阴影 ramp，误差敏感，重编码收益低风险高。
> `data URI` = 以 base64 内嵌、没有 bufferView 的图片，重编码时要一并转成 bufferView。

## 总览

| 模型 | 文件体积 | 贴图数 | 贴图总量 | 占比 | 可有损 | 需无损 | 保留原样 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| feibi | 25.78MB | 80 | 7.52MB | 29% | 6.82MB | 0.70MB | 0.00MB |
| rankaluli | 24.92MB | 49 | 6.80MB | 27% | 6.10MB | 0.70MB | 0.00MB |
| xuetuan | 24.05MB | 21 | 2.35MB | 10% | 1.67MB | 0.68MB | 0.00MB |

## feibi

| # | 格式 | 尺寸 | 体积 | alpha | 引用 | 处理建议 |
| --- | --- | --- | --- | --- | --- | --- |
| 71 | PNG | 2048×2048 | 1.52MB | 有·未用 | material_atlas_00540_1.baseColor<br>material_atlas_00540_1._MainTex<br>material_atlas_00540_1._ShadeTexture | 可有损 |
| 11 | PNG | 1024×1024 | 546KB | 有·未用 | material_51.baseColor<br>material_51._MainTex<br>material_51._ShadeTexture | 可有损 |
| 12 | JPEG | 4096×4096 | 430KB | 无 | material_52.baseColor<br>material_52._MainTex<br>material_52._ShadeTexture | 可有损 |
| 53 | JPEG | 2048×2048 | 149KB | 无 | Hair_material_14.baseColor<br>Hair_material_14._MainTex<br>Hair_material_14._ShadeTexture | 可有损 |
| 51 | JPEG | 2048×2048 | 139KB | 无 | Hair_material_11.baseColor<br>Hair_material_11._MainTex<br>Hair_material_11._ShadeTexture | 可有损 |
| 50 | JPEG | 2048×2048 | 138KB | 无 | Hair_material_10.baseColor<br>Hair_material_10._MainTex<br>Hair_material_10._ShadeTexture | 可有损 |
| 52 | JPEG | 2048×2048 | 138KB | 无 | Hair_material_12.baseColor<br>Hair_material_13.baseColor<br>Hair_material_12._MainTex<br>Hair_material_12._ShadeTexture<br>Hair_material_13._MainTex<br>Hair_material_13._ShadeTexture | 可有损 |
| 20 | JPEG | 2048×2048 | 131KB | 无 | material_36.baseColor<br>material_36._MainTex<br>material_36._ShadeTexture | 可有损 |
| 23 | JPEG | 2048×2048 | 131KB | 无 | material_39.baseColor<br>material_39._MainTex<br>material_39._ShadeTexture | 可有损 |
| 18 | JPEG | 2048×2048 | 131KB | 无 | material_34.baseColor<br>material_34._MainTex<br>material_34._ShadeTexture | 可有损 |
| 19 | JPEG | 2048×2048 | 130KB | 无 | material_35.baseColor<br>material_35._MainTex<br>material_35._ShadeTexture | 可有损 |
| 21 | JPEG | 2048×2048 | 130KB | 无 | material_37.baseColor<br>material_37._MainTex<br>material_37._ShadeTexture | 可有损 |
| 17 | JPEG | 2048×2048 | 130KB | 无 | material_33.baseColor<br>material_33._MainTex<br>material_33._ShadeTexture | 可有损 |
| 22 | JPEG | 2048×2048 | 130KB | 无 | material_38.baseColor<br>material_38._MainTex<br>material_38._ShadeTexture | 可有损 |
| 5 | PNG | 512×512 | 122KB | 有·用到 | material_eyelineup.baseColor<br>material_eyelineup._MainTex<br>material_eyelineup._ShadeTexture | 无损压缩 |
| 7 | PNG | 512×512 | 117KB | 有·未用 | material_eyewhites.baseColor<br>material_eyewhites._MainTex<br>material_eyewhites._ShadeTexture | 可有损 |
| 2 | PNG | 512×512 | 116KB | 有·用到 | material_eyebrows.baseColor<br>material_eyebrows._MainTex<br>material_eyebrows._ShadeTexture | 无损压缩 |
| 65 | JPEG | 2048×2048 | 113KB | 无 | Hair_material_27.baseColor<br>Hair_material_27._MainTex<br>Hair_material_27._ShadeTexture | 可有损 |
| 54 | JPEG | 2048×2048 | 113KB | 无 | Hair_material_15.baseColor<br>Hair_material_15._MainTex<br>Hair_material_15._ShadeTexture | 可有损 |
| 27 | JPEG | 2048×2048 | 112KB | 无 | material_17.baseColor<br>material_17._MainTex<br>material_17._ShadeTexture | 可有损 |
| 28 | JPEG | 2048×2048 | 112KB | 无 | material_18.baseColor<br>material_18._MainTex<br>material_18._ShadeTexture | 可有损 |
| 26 | JPEG | 2048×2048 | 112KB | 无 | material_16.baseColor<br>material_16._MainTex<br>material_16._ShadeTexture | 可有损 |
| 3 | PNG | 512×512 | 112KB | 有·用到 | material_nose.baseColor<br>material_nose._MainTex<br>material_nose._ShadeTexture | 无损压缩 |
| 25 | JPEG | 2048×2048 | 108KB | 无 | material_15.baseColor<br>material_15._MainTex<br>material_15._ShadeTexture | 可有损 |
| 24 | JPEG | 2048×2048 | 101KB | 无 | material_14.baseColor<br>material_14._MainTex<br>material_14._ShadeTexture | 可有损 |
| 35 | JPEG | 2048×2048 | 101KB | 无 | material_26.baseColor<br>material_26._MainTex<br>material_26._ShadeTexture | 可有损 |
| 29 | JPEG | 2048×2048 | 99KB | 无 | material_19.baseColor<br>material_19._MainTex<br>material_19._ShadeTexture | 可有损 |
| 30 | JPEG | 2048×2048 | 99KB | 无 | material_20.baseColor<br>material_20._MainTex<br>material_20._ShadeTexture | 可有损 |
| 9 | PNG | 512×512 | 98KB | 有·用到 | `data URI`<br>material_eyer.baseColor<br>material_eyer._MainTex<br>material_eyer._ShadeTexture | 无损压缩 |
| 8 | PNG | 512×512 | 98KB | 有·用到 | `data URI`<br>material_eyel.baseColor<br>material_eyel._MainTex<br>material_eyel._ShadeTexture | 无损压缩 |
| 36 | JPEG | 2048×2048 | 86KB | 无 | material_27.baseColor<br>material_27._MainTex<br>material_27._ShadeTexture | 可有损 |
| 32 | JPEG | 2048×2048 | 82KB | 无 | material_22.baseColor<br>material_22._MainTex<br>material_22._ShadeTexture | 可有损 |
| 31 | JPEG | 2048×2048 | 82KB | 无 | material_21.baseColor<br>material_21._MainTex<br>material_21._ShadeTexture | 可有损 |
| 0 | PNG | 512×512 | 78KB | 有·用到 | `data URI`<br>material_body.baseColor<br>material_body._MainTex<br>material_body._ShadeTexture | 无损压缩 |
| 74 | JPEG | 1024×1024 | 73KB | 无 | Hair_KK CRISTAL 4175.baseColor<br>Hair_KK CRISTAL 4175._MainTex<br>Hair_KK CRISTAL 4175._ShadeTexture | 可有损 |
| 76 | JPEG | 1024×1024 | 73KB | 无 | Hair_KK CRISTAL 4295.baseColor<br>Hair_KK CRISTAL 4295._MainTex<br>Hair_KK CRISTAL 4295._ShadeTexture | 可有损 |
| 67 | JPEG | 1024×1024 | 65KB | 无 | Hair_material_2.baseColor<br>Hair_material_2._MainTex<br>Hair_material_2._ShadeTexture<br>Hair_material_2._MainTex<br>Hair_material_2._ShadeTexture | 可有损 |
| 10 | PNG | 256×256 | 61KB | 有·用到 | material_tongue.baseColor<br>material_tongue._MainTex<br>material_tongue._ShadeTexture | 无损压缩 |
| 70 | JPEG | 1024×1024 | 60KB | 无 | Hair_material_1.baseColor | 可有损 |
| 61 | JPEG | 1024×1024 | 58KB | 无 | Hair_material_23.baseColor<br>Hair_material_23._MainTex<br>Hair_material_23._ShadeTexture | 可有损 |
| 58 | JPEG | 1024×1024 | 58KB | 无 | Hair_material_19.baseColor<br>Hair_material_19._MainTex<br>Hair_material_19._ShadeTexture | 可有损 |
| 59 | JPEG | 1024×1024 | 58KB | 无 | Hair_material_21.baseColor<br>Hair_material_21._MainTex<br>Hair_material_21._ShadeTexture | 可有损 |
| 57 | JPEG | 1024×1024 | 58KB | 无 | Hair_material_18.baseColor<br>Hair_material_20.baseColor<br>Hair_material_18._MainTex<br>Hair_material_18._ShadeTexture<br>Hair_material_20._MainTex<br>Hair_material_20._ShadeTexture | 可有损 |
| 60 | JPEG | 1024×1024 | 58KB | 无 | Hair_material_22.baseColor<br>Hair_material_22._MainTex<br>Hair_material_22._ShadeTexture | 可有损 |
| 79 | JPEG | 1024×1024 | 50KB | 无 | Hair_material_0.baseColor<br>Hair_material_0._MainTex<br>Hair_material_0._ShadeTexture<br>Hair_material_0._MainTex<br>Hair_material_0._ShadeTexture<br>Hair_material_0._MainTex<br>Hair_material_0._ShadeTexture | 可有损 |
| 69 | JPEG | 1024×1024 | 49KB | 无 | Hair_material_0.baseColor | 可有损 |
| 48 | JPEG | 1024×1024 | 43KB | 无 | Hair_material_8.baseColor<br>Hair_material_8._MainTex<br>Hair_material_8._ShadeTexture | 可有损 |
| 49 | JPEG | 1024×1024 | 43KB | 无 | Hair_material_9.baseColor<br>Hair_material_9._MainTex<br>Hair_material_9._ShadeTexture | 可有损 |
| 14 | JPEG | 1024×1024 | 40KB | 无 | material_12.baseColor<br>material_12._MainTex<br>material_12._ShadeTexture | 可有损 |
| 15 | JPEG | 1024×1024 | 40KB | 无 | material_13.baseColor<br>material_13._MainTex<br>material_13._ShadeTexture | 可有损 |
| 16 | JPEG | 1024×1024 | 40KB | 无 | material_24.baseColor<br>material_24._MainTex<br>material_24._ShadeTexture | 可有损 |
| 56 | JPEG | 1024×1024 | 40KB | 无 | Hair_material_17.baseColor<br>Hair_material_17._MainTex<br>Hair_material_17._ShadeTexture | 可有损 |
| 63 | JPEG | 1024×1024 | 40KB | 无 | Hair_material_25.baseColor<br>Hair_material_25._MainTex<br>Hair_material_25._ShadeTexture | 可有损 |
| 62 | JPEG | 1024×1024 | 39KB | 无 | Hair_material_24.baseColor<br>Hair_material_24._MainTex<br>Hair_material_24._ShadeTexture | 可有损 |
| 73 | JPEG | 1024×1024 | 36KB | 无 | Hair_KK BL120101_HAIR_COL 4175.baseColor<br>Hair_KK BL120101_HAIR_COL 4175._MainTex<br>Hair_KK BL120101_HAIR_COL 4175._ShadeTexture | 可有损 |
| 75 | JPEG | 1024×1024 | 36KB | 无 | Hair_KK BL120101_HAIR_COL 4295.baseColor<br>Hair_KK BL120101_HAIR_COL 4295._MainTex<br>Hair_KK BL120101_HAIR_COL 4295._ShadeTexture | 可有损 |
| 46 | JPEG | 1024×1024 | 36KB | 无 | Hair_material_6.baseColor<br>Hair_material_6._MainTex<br>Hair_material_6._ShadeTexture | 可有损 |
| 47 | JPEG | 1024×1024 | 36KB | 无 | Hair_material_7.baseColor<br>Hair_material_7._MainTex<br>Hair_material_7._ShadeTexture | 可有损 |
| 45 | JPEG | 1024×1024 | 33KB | 无 | Hair_material_5.baseColor<br>Hair_material_5._MainTex<br>Hair_material_5._ShadeTexture | 可有损 |
| 44 | JPEG | 1024×1024 | 33KB | 无 | Hair_material_4.baseColor<br>Hair_material_4._MainTex<br>Hair_material_4._ShadeTexture | 可有损 |
| 33 | JPEG | 1024×1024 | 32KB | 无 | material_23.baseColor<br>material_23._MainTex<br>material_23._ShadeTexture | 可有损 |
| 34 | JPEG | 1024×1024 | 32KB | 无 | material_25.baseColor<br>material_25._MainTex<br>material_25._ShadeTexture | 可有损 |
| 4 | PNG | 256×256 | 31KB | 有·用到 | material_teeth.baseColor<br>material_teeth._MainTex<br>material_teeth._ShadeTexture | 无损压缩 |
| 37 | JPEG | 1024×1024 | 29KB | 无 | material_28.baseColor<br>material_28._MainTex<br>material_28._ShadeTexture | 可有损 |
| 77 | JPEG | 1024×1024 | 28KB | 无 | Hair_KK Mythra_BODY_COL 3385.baseColor<br>Hair_KK Mythra_BODY_COL 3385._MainTex<br>Hair_KK Mythra_BODY_COL 3385._ShadeTexture | 可有损 |
| 72 | JPEG | 1024×1024 | 26KB | 无 | Hair_KK acs_m_usamimi 4045.baseColor<br>Hair_KK acs_m_usamimi 4045._MainTex<br>Hair_KK acs_m_usamimi 4045._ShadeTexture | 可有损 |
| 41 | JPEG | 1024×1024 | 25KB | 无 | Hair_material_1.baseColor | 可有损 |
| 40 | JPEG | 1024×1024 | 25KB | 无 | Hair_material_0.baseColor | 可有损 |
| 42 | JPEG | 1024×1024 | 25KB | 无 | Hair_material_2.baseColor | 可有损 |
| 43 | JPEG | 1024×1024 | 25KB | 无 | Hair_material_3.baseColor | 可有损 |
| 38 | JPEG | 1024×1024 | 20KB | 无 | Hair_material_28.baseColor<br>Hair_material_28._MainTex<br>Hair_material_28._ShadeTexture | 可有损 |
| 55 | JPEG | 1024×1024 | 20KB | 无 | Hair_material_16.baseColor<br>Hair_material_16._MainTex<br>Hair_material_16._ShadeTexture | 可有损 |
| 66 | JPEG | 1024×1024 | 17KB | 无 | Hair_KK cf_m_hair_b_ribon_24_00_i 3886.baseColor<br>Hair_KK cf_m_hair_b_ribon_24_00_i 3886._MainTex<br>Hair_KK cf_m_hair_b_ribon_24_00_i 3886._ShadeTexture | 可有损 |
| 78 | JPEG | 1024×1024 | 17KB | 无 | Hair_KK Cristal 3385.baseColor<br>Hair_KK Cristal 3385._MainTex<br>Hair_KK Cristal 3385._ShadeTexture | 可有损 |
| 1 | JPEG | 512×512 | 14KB | 无 | material_face.baseColor<br>material_face._MainTex<br>material_face._ShadeTexture | 可有损 |
| 6 | PNG | 64×64 | 2KB | 有·用到 | material_eyelinedown.baseColor<br>material_eyelinedown._MainTex<br>material_eyelinedown._ShadeTexture | 无损压缩 |
| 64 | JPEG | 128×128 | 1KB | 无 | Hair_material_26.baseColor<br>Hair_material_26._MainTex<br>Hair_material_26._ShadeTexture | 可有损 |
| 39 | JPEG | 64×64 | 1KB | 无 | Hair_material_29.baseColor<br>Hair_material_29._MainTex<br>Hair_material_29._ShadeTexture | 可有损 |
| 13 | JPEG | 64×64 | 1KB | 无 | material_32.baseColor<br>material_32._MainTex<br>material_32._ShadeTexture | 可有损 |
| 68 | JPEG | 64×64 | 1KB | 无 | Hair_material_3.baseColor<br>Hair_material_3._MainTex<br>Hair_material_3._ShadeTexture<br>Hair_material_3._MainTex<br>Hair_material_3._ShadeTexture | 可有损 |

重复贴图：14 = 15 = 16

## rankaluli

| # | 格式 | 尺寸 | 体积 | alpha | 引用 | 处理建议 |
| --- | --- | --- | --- | --- | --- | --- |
| 42 | PNG | 2048×2048 | 1.51MB | 有·未用 | material_atlas_01220_1.baseColor<br>material_atlas_01220_1._MainTex<br>material_atlas_01220_1._ShadeTexture | 可有损 |
| 43 | PNG | 2048×2048 | 1.41MB | 有·未用 | material_atlas_01221_1.baseColor<br>material_atlas_01221_1._MainTex<br>material_atlas_01221_1._ShadeTexture | 可有损 |
| 11 | PNG | 1024×1024 | 546KB | 有·未用 | material_51.baseColor<br>material_51._MainTex<br>material_51._ShadeTexture | 可有损 |
| 19 | JPEG | 2048×2048 | 131KB | 无 | material_36.baseColor<br>material_36._MainTex<br>material_36._ShadeTexture | 可有损 |
| 22 | JPEG | 2048×2048 | 131KB | 无 | material_39.baseColor<br>material_39._MainTex<br>material_39._ShadeTexture | 可有损 |
| 17 | JPEG | 2048×2048 | 131KB | 无 | material_34.baseColor<br>material_34._MainTex<br>material_34._ShadeTexture | 可有损 |
| 18 | JPEG | 2048×2048 | 130KB | 无 | material_35.baseColor<br>material_35._MainTex<br>material_35._ShadeTexture | 可有损 |
| 20 | JPEG | 2048×2048 | 130KB | 无 | material_37.baseColor<br>material_37._MainTex<br>material_37._ShadeTexture | 可有损 |
| 16 | JPEG | 2048×2048 | 130KB | 无 | material_33.baseColor<br>material_33._MainTex<br>material_33._ShadeTexture | 可有损 |
| 21 | JPEG | 2048×2048 | 130KB | 无 | material_38.baseColor<br>material_38._MainTex<br>material_38._ShadeTexture | 可有损 |
| 5 | PNG | 512×512 | 122KB | 有·用到 | material_eyelineup.baseColor<br>material_eyelineup._MainTex<br>material_eyelineup._ShadeTexture | 无损压缩 |
| 7 | PNG | 512×512 | 117KB | 有·未用 | material_eyewhites.baseColor<br>material_eyewhites._MainTex<br>material_eyewhites._ShadeTexture | 可有损 |
| 2 | PNG | 512×512 | 116KB | 有·用到 | material_eyebrows.baseColor<br>material_eyebrows._MainTex<br>material_eyebrows._ShadeTexture | 无损压缩 |
| 26 | JPEG | 2048×2048 | 112KB | 无 | material_17.baseColor<br>material_17._MainTex<br>material_17._ShadeTexture | 可有损 |
| 27 | JPEG | 2048×2048 | 112KB | 无 | material_18.baseColor<br>material_18._MainTex<br>material_18._ShadeTexture | 可有损 |
| 25 | JPEG | 2048×2048 | 112KB | 无 | material_16.baseColor<br>material_16._MainTex<br>material_16._ShadeTexture | 可有损 |
| 3 | PNG | 512×512 | 112KB | 有·用到 | material_nose.baseColor<br>material_nose._MainTex<br>material_nose._ShadeTexture | 无损压缩 |
| 24 | JPEG | 2048×2048 | 108KB | 无 | material_15.baseColor<br>material_15._MainTex<br>material_15._ShadeTexture | 可有损 |
| 23 | JPEG | 2048×2048 | 101KB | 无 | material_14.baseColor<br>material_14._MainTex<br>material_14._ShadeTexture | 可有损 |
| 34 | JPEG | 2048×2048 | 101KB | 无 | material_26.baseColor<br>material_26._MainTex<br>material_26._ShadeTexture | 可有损 |
| 28 | JPEG | 2048×2048 | 99KB | 无 | material_19.baseColor<br>material_19._MainTex<br>material_19._ShadeTexture | 可有损 |
| 29 | JPEG | 2048×2048 | 99KB | 无 | material_20.baseColor<br>material_20._MainTex<br>material_20._ShadeTexture | 可有损 |
| 9 | PNG | 512×512 | 98KB | 有·用到 | `data URI`<br>material_eyer.baseColor<br>material_eyer._MainTex<br>material_eyer._ShadeTexture | 无损压缩 |
| 8 | PNG | 512×512 | 98KB | 有·用到 | `data URI`<br>material_eyel.baseColor<br>material_eyel._MainTex<br>material_eyel._ShadeTexture | 无损压缩 |
| 35 | JPEG | 2048×2048 | 86KB | 无 | material_27.baseColor<br>material_27._MainTex<br>material_27._ShadeTexture | 可有损 |
| 31 | JPEG | 2048×2048 | 82KB | 无 | material_22.baseColor<br>material_22._MainTex<br>material_22._ShadeTexture | 可有损 |
| 30 | JPEG | 2048×2048 | 82KB | 无 | material_21.baseColor<br>material_21._MainTex<br>material_21._ShadeTexture | 可有损 |
| 0 | PNG | 512×512 | 79KB | 有·用到 | `data URI`<br>material_body.baseColor<br>material_body._MainTex<br>material_body._ShadeTexture | 无损压缩 |
| 38 | JPEG | 1024×1024 | 70KB | 无 | Hair_material_3.baseColor<br>Hair_material_2.baseColor | 可有损 |
| 45 | JPEG | 1024×1024 | 70KB | 无 | Hair_material_3.baseColor<br>Hair_material_2.baseColor<br>Hair_material_3._MainTex<br>Hair_material_3._ShadeTexture<br>Hair_material_2._MainTex<br>Hair_material_2._ShadeTexture<br>Hair_material_3._MainTex<br>Hair_material_3._ShadeTexture<br>Hair_material_2._MainTex<br>Hair_material_2._ShadeTexture | 可有损 |
| 10 | PNG | 256×256 | 61KB | 有·用到 | material_tongue.baseColor<br>material_tongue._MainTex<br>material_tongue._ShadeTexture | 无损压缩 |
| 41 | JPEG | 1024×1024 | 43KB | 无 | Hair_material_1.baseColor | 可有损 |
| 48 | JPEG | 1024×1024 | 43KB | 无 | Hair_material_1.baseColor<br>Hair_material_1._MainTex<br>Hair_material_1._ShadeTexture<br>Hair_material_1._MainTex<br>Hair_material_1._ShadeTexture | 可有损 |
| 13 | JPEG | 1024×1024 | 40KB | 无 | material_12.baseColor<br>material_12._MainTex<br>material_12._ShadeTexture | 可有损 |
| 14 | JPEG | 1024×1024 | 40KB | 无 | material_13.baseColor<br>material_13._MainTex<br>material_13._ShadeTexture | 可有损 |
| 15 | JPEG | 1024×1024 | 40KB | 无 | material_24.baseColor<br>material_24._MainTex<br>material_24._ShadeTexture | 可有损 |
| 37 | JPEG | 1024×1024 | 36KB | 无 | Hair_KK cf_m_hair_b_ribon_31_00 3896.baseColor | 可有损 |
| 44 | JPEG | 1024×1024 | 36KB | 无 | Hair_KK cf_m_hair_b_ribon_31_00 3896.baseColor<br>Hair_KK cf_m_hair_b_ribon_31_00 3896._MainTex<br>Hair_KK cf_m_hair_b_ribon_31_00 3896._ShadeTexture<br>Hair_KK cf_m_hair_b_ribon_31_00 3896._MainTex<br>Hair_KK cf_m_hair_b_ribon_31_00 3896._ShadeTexture | 可有损 |
| 32 | JPEG | 1024×1024 | 32KB | 无 | material_23.baseColor<br>material_23._MainTex<br>material_23._ShadeTexture | 可有损 |
| 33 | JPEG | 1024×1024 | 32KB | 无 | material_25.baseColor<br>material_25._MainTex<br>material_25._ShadeTexture | 可有损 |
| 4 | PNG | 256×256 | 31KB | 有·用到 | material_teeth.baseColor<br>material_teeth._MainTex<br>material_teeth._ShadeTexture | 无损压缩 |
| 40 | JPEG | 1024×1024 | 30KB | 无 | Hair_material_0.baseColor | 可有损 |
| 47 | JPEG | 1024×1024 | 30KB | 无 | Hair_material_0.baseColor<br>Hair_material_0._MainTex<br>Hair_material_0._ShadeTexture<br>Hair_material_0._MainTex<br>Hair_material_0._ShadeTexture | 可有损 |
| 36 | JPEG | 1024×1024 | 29KB | 无 | material_28.baseColor<br>material_28._MainTex<br>material_28._ShadeTexture | 可有损 |
| 1 | JPEG | 512×512 | 14KB | 无 | material_face.baseColor<br>material_face._MainTex<br>material_face._ShadeTexture | 可有损 |
| 6 | PNG | 64×64 | 2KB | 有·用到 | material_eyelinedown.baseColor<br>material_eyelinedown._MainTex<br>material_eyelinedown._ShadeTexture | 无损压缩 |
| 12 | JPEG | 64×64 | 1KB | 无 | material_32.baseColor<br>material_32._MainTex<br>material_32._ShadeTexture | 可有损 |
| 39 | JPEG | 64×64 | 1KB | 无 | Hair_material_4.baseColor | 可有损 |
| 46 | JPEG | 64×64 | 1KB | 无 | Hair_material_4.baseColor<br>Hair_material_4._MainTex<br>Hair_material_4._ShadeTexture<br>Hair_material_4._MainTex<br>Hair_material_4._ShadeTexture | 可有损 |

重复贴图：13 = 14 = 15；37 = 44；38 = 45；39 = 46；40 = 47；41 = 48

## xuetuan

| # | 格式 | 尺寸 | 体积 | alpha | 引用 | 处理建议 |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | PNG | 1024×1024 | 546KB | 有·未用 | material_30.baseColor<br>material_30._MainTex<br>material_30._ShadeTexture | 可有损 |
| 13 | JPEG | 4096×4096 | 495KB | 无 | material_31.baseColor<br>material_31._MainTex<br>material_31._ShadeTexture | 可有损 |
| 11 | JPEG | 4096×4096 | 300KB | 无 | material_11.baseColor<br>material_11._MainTex<br>material_11._ShadeTexture | 可有损 |
| 2 | PNG | 512×512 | 150KB | 有·用到 | material_eyebrows.baseColor<br>material_eyebrows._MainTex<br>material_eyebrows._ShadeTexture | 无损压缩 |
| 7 | PNG | 512×512 | 117KB | 有·未用 | material_eyewhites.baseColor<br>material_eyewhites._MainTex<br>material_eyewhites._ShadeTexture | 可有损 |
| 5 | PNG | 512×512 | 115KB | 有·用到 | material_eyelineup.baseColor<br>material_eyelineup._MainTex<br>material_eyelineup._ShadeTexture | 无损压缩 |
| 3 | PNG | 512×512 | 112KB | 有·用到 | material_nose.baseColor<br>material_nose._MainTex<br>material_nose._ShadeTexture | 无损压缩 |
| 17 | JPEG | 2048×2048 | 90KB | 无 | material_13.baseColor<br>material_13._MainTex<br>material_13._ShadeTexture | 可有损 |
| 0 | PNG | 512×512 | 89KB | 有·用到 | material_body.baseColor<br>material_body._MainTex<br>material_body._ShadeTexture | 无损压缩 |
| 19 | JPEG | 2048×2048 | 74KB | 无 | material_15.baseColor<br>material_15._MainTex<br>material_15._ShadeTexture | 可有损 |
| 9 | PNG | 512×512 | 68KB | 有·用到 | material_eyer.baseColor<br>material_eyer._MainTex<br>material_eyer._ShadeTexture | 无损压缩 |
| 8 | PNG | 512×512 | 68KB | 有·用到 | material_eyel.baseColor<br>material_eyel._MainTex<br>material_eyel._ShadeTexture | 无损压缩 |
| 10 | PNG | 256×256 | 61KB | 有·用到 | material_tongue.baseColor<br>material_tongue._MainTex<br>material_tongue._ShadeTexture | 无损压缩 |
| 4 | PNG | 256×256 | 31KB | 有·用到 | material_teeth.baseColor<br>material_teeth._MainTex<br>material_teeth._ShadeTexture | 无损压缩 |
| 20 | JPEG | 1024×1024 | 28KB | 无 | material_16.baseColor<br>material_16._MainTex<br>material_16._ShadeTexture | 可有损 |
| 18 | JPEG | 1024×1024 | 26KB | 无 | material_14.baseColor<br>material_14._MainTex<br>material_14._ShadeTexture | 可有损 |
| 15 | JPEG | 1024×1024 | 17KB | 无 | material_29.baseColor<br>material_29._MainTex<br>material_29._ShadeTexture | 可有损 |
| 1 | JPEG | 512×512 | 13KB | 无 | material_face.baseColor<br>material_face._MainTex<br>material_face._ShadeTexture | 可有损 |
| 16 | JPEG | 256×256 | 2KB | 无 | material_12.baseColor<br>material_12._MainTex<br>material_12._ShadeTexture | 可有损 |
| 6 | PNG | 64×64 | 2KB | 有·用到 | material_eyelinedown.baseColor<br>material_eyelinedown._MainTex<br>material_eyelinedown._ShadeTexture | 无损压缩 |
| 14 | JPEG | 64×64 | 1KB | 无 | material_17.baseColor<br>material_17._MainTex<br>material_17._ShadeTexture | 可有损 |
